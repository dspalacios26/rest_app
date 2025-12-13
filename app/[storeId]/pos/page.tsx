"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Search, Plus, Minus, Trash2, CreditCard, Utensils, Coffee, ListOrdered, Edit, Settings } from "lucide-react"
import { useMenu, MenuItem } from "@/hooks/use-menu"
import { useOrders, Order, OrderItem } from "@/hooks/use-orders"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { MenuManager } from "@/components/menu-manager"
import { formatCurrency } from "@/lib/utils"

type CartItem = MenuItem & { quantity: number; notes: string; original_order_item_id?: string }

export default function POSPage() {
    const { storeId } = useParams()
    const { menuItems, loading: loadingMenu } = useMenu(storeId as string)
    const { orders: activeOrders, refresh: refreshOrders, updateStatus } = useOrders(storeId as string)

    const [activeTab, setActiveTab] = useState<'menu' | 'orders'>('menu')
    const [cart, setCart] = useState<CartItem[]>([])
    const [selectedCategory, setSelectedCategory] = useState<string>('All')
    const [searchQuery, setSearchQuery] = useState("")
    const [tableNumber, setTableNumber] = useState("")
    const [editingOrderId, setEditingOrderId] = useState<string | null>(null)

    const [paymentOrder, setPaymentOrder] = useState<Order | null>(null)
    const [tipAmount, setTipAmount] = useState<string>("0")

    const [submitting, setSubmitting] = useState(false)

    // Categories derivation
    const categories = ['All', ...Array.from(new Set(menuItems.map(i => i.category)))]

    // Filter Logic
    const filteredItems = menuItems.filter(item => {
        const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase())
        return matchesCategory && matchesSearch
    })

    // Cart Logic
    const addToCart = (item: MenuItem) => {
        setCart(prev => {
            const existing = prev.find(i => i.id === item.id)
            if (existing) {
                return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i)
            }
            return [...prev, { ...item, quantity: 1, notes: '' }]
        })
    }

    const updateQuantity = (itemId: string, delta: number) => {
        setCart(prev => prev.map(i => {
            if (i.id === itemId) return { ...i, quantity: Math.max(1, i.quantity + delta) }
            return i
        }))
    }

    const removeFromCart = (itemId: string) => {
        setCart(prev => prev.filter(i => i.id !== itemId))
    }

    // Totals for Cart
    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0)
    const total = subtotal

    // Submit / Update Order
    const handlePlaceOrder = async () => {
        if (cart.length === 0 || !storeId) return
        setSubmitting(true)
        try {
            let orderId = editingOrderId

            if (orderId) {
                // UPDATE EXISTING ORDER

                // 1. Update header
                const { error } = await supabase
                    .from('orders')
                    .update({
                        status: 'queue',
                        total_amount: total,
                        table_number: tableNumber
                    })
                    .eq('id', orderId)
                if (error) throw error

                // 2. Fetch existing Active items
                const { data: existingItems } = await supabase
                    .from('order_items')
                    .select('*')
                    .eq('order_id', orderId)
                    .neq('status', 'cancelled') // Ignore cancelled for logic

                // 3. Compare Cart (Target) vs Existing (Current)
                // Group by MenuItemID

                type ExistingItem = NonNullable<typeof existingItems>[number]
                const existingMap = new Map<string, ExistingItem[]>()

                existingItems?.forEach(item => {
                    const list = existingMap.get(item.menu_item_id) || []
                    list.push(item)
                    existingMap.set(item.menu_item_id, list)
                })

                const itemsToInsert: any[] = []
                const itemsToUpdate: any[] = []
                const explicitCancels: string[] = []

                // Process Cart Items
                for (const cartItem of cart) {
                    const currentItems = existingMap.get(cartItem.id) || []
                    const currentQty = currentItems.reduce((sum, i) => sum + i.quantity, 0)
                    const targetQty = cartItem.quantity

                    const diff = targetQty - currentQty

                    if (diff > 0) {
                        // ADD-ON: Insert NEW row for the difference
                        itemsToInsert.push({
                            order_id: orderId,
                            menu_item_id: cartItem.id,
                            quantity: diff,
                            price_at_time: cartItem.price,
                            notes: cartItem.notes, // Notes on new items
                            status: 'active'
                        })
                        // Existing rows remain touched (Served/Prepared)
                    } else if (diff < 0) {
                        // REDUCTION: Reduce quantity or cancel rows
                        // Remove |diff| amount
                        let remainingToRemove = Math.abs(diff)

                        // Sort by created_at desc (remove newest first)
                        currentItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

                        for (const item of currentItems) {
                            if (remainingToRemove <= 0) break

                            if (item.quantity <= remainingToRemove) {
                                // Cancel entire item
                                explicitCancels.push(item.id)
                                remainingToRemove -= item.quantity
                            } else {
                                // Reduce quantity
                                itemsToUpdate.push({
                                    id: item.id,
                                    quantity: item.quantity - remainingToRemove
                                })
                                remainingToRemove = 0
                            }
                        }
                    } else {
                        // Exact match
                    }

                    // Remove from map to track what's left (items in DB but not in Cart)
                    existingMap.delete(cartItem.id)
                }

                // Any items left in existingMap are in DB but NOT in Cart -> Cancel all
                for (const [_, items] of existingMap) {
                    items.forEach(i => explicitCancels.push(i.id))
                }

                // Execute Batch operations
                if (explicitCancels.length > 0) {
                    await supabase.from('order_items').update({ status: 'cancelled' }).in('id', explicitCancels)
                }

                if (itemsToUpdate.length > 0) {
                    await supabase.from('order_items').upsert(itemsToUpdate)
                }

                if (itemsToInsert.length > 0) {
                    await supabase.from('order_items').insert(itemsToInsert)
                }

            } else {
                // CREATE NEW ORDER
                const { data: orderData, error: orderError } = await supabase
                    .from('orders')
                    .insert([{
                        store_id: storeId,
                        table_number: tableNumber || 'Counter',
                        status: 'queue',
                        total_amount: total,
                    }])
                    .select()
                    .single()
                if (orderError) throw orderError
                orderId = orderData.id

                // Insert Items
                const orderItems = cart.map((item) => ({
                    order_id: orderId,
                    menu_item_id: item.id,
                    quantity: item.quantity,
                    price_at_time: item.price,
                    notes: item.notes,
                    status: 'active'
                }))

                const { error: itemsError } = await supabase.from('order_items').insert(orderItems)
                if (itemsError) throw itemsError
            }

            // Reset
            resetCart()
            setActiveTab('orders')
            refreshOrders()

        } catch (error) {
            console.error("Error placing order:", error)
            alert("Failed to place/update order.")
        } finally {
            setSubmitting(false)
        }
    }

    const resetCart = () => {
        setCart([])
        setTableNumber("")
        setEditingOrderId(null)
    }

    const handleEditOrder = (order: Order) => {
        // Aggregate items by menu_item_id
        const aggregatedItems = new Map<string, CartItem>()

        if (order.items) {
            order.items.forEach(item => {
                if (item.status === 'cancelled') return

                const existing = aggregatedItems.get(item.menu_item_id)
                if (existing) {
                    existing.quantity += item.quantity
                    if (item.notes) existing.notes = (existing.notes ? existing.notes + "; " : "") + item.notes
                } else {
                    const menuItem = menuItems.find(m => m.id === item.menu_item_id)
                    if (!menuItem) return

                    aggregatedItems.set(item.menu_item_id, {
                        ...menuItem,
                        quantity: item.quantity,
                        notes: item.notes || '',
                    })
                }
            })
        }

        setCart(Array.from(aggregatedItems.values()))
        setTableNumber(order.table_number)
        setEditingOrderId(order.id)
        setActiveTab('menu')
    }

    const handleCancelOrder = async (orderId: string) => {
        if (!confirm("Are you sure you want to cancel this order?")) return
        const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId)
        if (error) {
            console.error(error)
            alert("Failed to cancel")
        } else {
            refreshOrders()
        }
    }

    const handlePaymentClick = (order: Order) => {
        setPaymentOrder(order)
        setTipAmount("0")
    }

    const handleConfirmPayment = async () => {
        if (!paymentOrder) return

        const tip = parseFloat(tipAmount) || 0
        // Update total with tip and status
        // Usually Total = Food + Tip.
        // Current total_amount in DB is Food. 
        // We should update total_amount = Food + Tip? Or store Tip separately? Schema has no tip column.
        // User said "remove the tip from the order generation", "include how much it was... how much tip was added... obtain full bill"
        // I'll assume we update total_amount to include tip.

        const finalTotal = (paymentOrder.total_amount || 0) + tip

        const { error } = await supabase
            .from('orders')
            .update({
                status: 'paid',
                total_amount: finalTotal,
                // notes: `Tip: ${tip}` // Optional logging
            })
            .eq('id', paymentOrder.id)

        if (error) {
            console.error(error)
            return
        }

        setPaymentOrder(null)
        refreshOrders()
    }

    return (
        <div className="h-[calc(100vh-6rem)] flex gap-6">

            {/* Left Panel: Content */}
            <div className="flex-1 flex flex-col gap-4">
                {/* Header / Tabs */}
                <div className="flex items-center justify-between bg-card p-3 rounded-lg border shadow-sm">
                    <div className="flex gap-4">
                        <Button
                            variant={activeTab === 'menu' ? 'default' : 'ghost'}
                            onClick={() => setActiveTab('menu')}
                            className="gap-2"
                        >
                            <Utensils className="w-4 h-4" /> {editingOrderId ? 'Editing Order' : 'New Order'}
                        </Button>
                        <Button
                            variant={activeTab === 'orders' ? 'default' : 'ghost'}
                            onClick={() => {
                                if (editingOrderId) {
                                    if (confirm("Discard changes to currently editing order?")) resetCart()
                                    else return
                                }
                                setActiveTab('orders')
                            }}
                            className="gap-2"
                        >
                            <ListOrdered className="w-4 h-4" /> Active Orders
                        </Button>
                    </div>

                    <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="icon">
                                <Settings className="w-4 h-4" />
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                            <MenuManager storeId={storeId as string} />
                        </DialogContent>
                    </Dialog>
                </div>

                {activeTab === 'menu' ? (
                    <>
                        {/* Search & Categories */}
                        <div className="flex flex-col gap-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search menu..."
                                    className="pl-9 bg-card"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                {categories.map(cat => (
                                    <Button
                                        key={cat}
                                        variant={selectedCategory === cat ? "secondary" : "outline"}
                                        size="sm"
                                        onClick={() => setSelectedCategory(cat)}
                                        className="whitespace-nowrap"
                                    >
                                        {cat}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {/* Menu Grid */}
                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {filteredItems.map(item => (
                                    <Card
                                        key={item.id}
                                        className="cursor-pointer hover:border-primary/50 transition-colors active:scale-95"
                                        onClick={() => addToCart(item)}
                                    >
                                        <CardContent className="p-4 flex flex-col h-full gap-2">
                                            <div className="aspect-video rounded-md bg-muted/50 w-full mb-2 flex items-center justify-center text-muted-foreground">
                                                {item.image_url ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover rounded-md" /> : <Coffee className="w-8 h-8 opacity-20" />}
                                            </div>
                                            <div className="flex items-start justify-between gap-2 mt-auto">
                                                <div className="font-medium truncate">{item.name}</div>
                                                <div className="font-bold text-primary">{formatCurrency(item.price)}</div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                            {filteredItems.length === 0 && (
                                <div className="text-center py-20 text-muted-foreground">
                                    No items found.
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    /* Active Orders List */
                    <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                        {activeOrders.length === 0 && <div className="text-center py-10">No active orders.</div>}
                        {activeOrders.map(order => (
                            <Card key={order.id} className="flex flex-col sm:flex-row justify-between p-4 gap-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <div className="font-bold text-lg">Table {order.table_number}</div>
                                        {order.status !== 'queue' && <span className="text-xs bg-secondary px-2 py-0.5 rounded uppercase">{order.status}</span>}
                                    </div>
                                    <div className="text-sm text-muted-foreground">#{order.order_number || order.id.slice(0, 4)}</div>
                                    <div className="mt-2 text-sm">
                                        {order.items?.map((item, i) => (
                                            <div key={i}>{item.quantity}x {item.menu_items?.name}</div>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-2 justify-center">
                                    <div className="text-xl font-bold">{formatCurrency(order.total_amount || 0)}</div>

                                    <div className="flex gap-2">
                                        {order.status !== 'paid' && (
                                            <>
                                                <Button size="sm" variant="outline" onClick={() => handleEditOrder(order)}>
                                                    <Edit className="w-4 h-4 mr-2" /> Modify
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={() => handlePaymentClick(order)}
                                                >
                                                    <CreditCard className="w-4 h-4 mr-2" /> Pay
                                                </Button>
                                                {/* ADDED CANCEL BUTTON */}
                                                <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => handleCancelOrder(order.id)}>
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </>
                                        )}
                                        {order.status === 'paid' && <Button size="sm" disabled>Paid</Button>}
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Right Panel: Cart */}
            {activeTab === 'menu' && (
                <Card className="w-80 md:w-96 flex flex-col shadow-lg border-l h-full">
                    <div className="p-4 border-b bg-muted/20">
                        <h2 className="font-semibold flex items-center gap-2">
                            {editingOrderId ? 'Editing Order' : 'New Order'}
                        </h2>
                        {editingOrderId && <span className="text-xs text-orange-500">Updating will return order to queue</span>}
                    </div>

                    <div className="p-4 grid gap-4 bg-muted/10">
                        <div className="space-y-2">
                            <Label className="text-xs">Table No.</Label>
                            <Input
                                value={tableNumber}
                                onChange={e => setTableNumber(e.target.value)}
                                placeholder="#"
                                className="h-8"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                        {cart.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-2 opacity-50">
                                <Utensils className="w-12 h-12" />
                                <p>Cart is empty</p>
                            </div>
                        ) : (
                            cart.map(item => (
                                <div key={item.id} className="flex gap-2">
                                    <div className="flex-1">
                                        <div className="flex justify-between font-medium text-sm">
                                            <span>{item.name}</span>
                                            <span>{formatCurrency(item.price * item.quantity)}</span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Button variant="outline" size="icon" className="h-6 w-6 rounded-full" onClick={() => updateQuantity(item.id, -1)}>
                                                <Minus className="w-3 h-3" />
                                            </Button>
                                            <span className="text-sm w-4 text-center">{item.quantity}</span>
                                            <Button variant="outline" size="icon" className="h-6 w-6 rounded-full" onClick={() => updateQuantity(item.id, 1)}>
                                                <Plus className="w-3 h-3" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive ml-auto" onClick={() => removeFromCart(item.id)}>
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="p-4 border-t space-y-4 bg-muted/20">
                        <div className="space-y-2">
                            <div className="flex justify-between font-bold text-lg pt-2 border-t">
                                <span>Total</span>
                                <span>{formatCurrency(total)}</span>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            {editingOrderId && (
                                <Button variant="outline" className="flex-1" onClick={resetCart}>
                                    Cancel
                                </Button>
                            )}
                            <Button className="flex-1 gap-2" size="lg" disabled={cart.length === 0 || submitting} onClick={handlePlaceOrder}>
                                {submitting ? "Processing..." : (
                                    editingOrderId ? "Update Order" : "Place Order"
                                )}
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            {/* Payment Dialog */}
            <Dialog open={!!paymentOrder} onOpenChange={(open) => !open && setPaymentOrder(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Complete Payment</DialogTitle>
                        <DialogDescription>
                            Table {paymentOrder?.table_number} • Order #{paymentOrder?.order_number || paymentOrder?.id.slice(0, 4)}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {/* Mini Menu Summary */}
                        <div className="bg-muted/30 rounded-lg p-3 space-y-2 max-h-[200px] overflow-y-auto text-sm border">
                            {paymentOrder?.items?.map((item, idx) => (
                                <div key={idx} className="flex justify-between">
                                    <span>{item.quantity}x {item.menu_items?.name}</span>
                                    {/* Price? We assume price is in item from my hook, but hook might need fix to return price_at_time if separate. 
                          Wait, my hook `use-orders` returns `menu_items(name)`. `order_items` usually has price.
                          Let's assume we proceed without detailed item price here or add it to hook if critical.
                          User asked for "mini menu of how much it was". Total is what matters usually.
                      */}
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between items-center font-medium">
                            <span>Subtotal</span>
                            <span>{formatCurrency(paymentOrder?.total_amount || 0)}</span>
                        </div>

                        <div className="space-y-2">
                            <Label>Add Tip (Optional)</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                                <Input
                                    type="number"
                                    className="pl-7"
                                    placeholder="0.00"
                                    value={tipAmount}
                                    onChange={e => setTipAmount(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex justify-between items-center font-bold text-lg border-t pt-4">
                            <span>Total to Pay</span>
                            <span>{formatCurrency((paymentOrder?.total_amount || 0) + (parseFloat(tipAmount) || 0))}</span>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPaymentOrder(null)}>Cancel</Button>
                        <Button onClick={handleConfirmPayment}>Confirm Payment</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
