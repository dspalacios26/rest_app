"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Search, Plus, Minus, Trash2, CreditCard, DollarSign, Utensils, Coffee, Beer, ShoppingBag, ListOrdered, CheckCircle2 } from "lucide-react"
import { useMenu, MenuItem } from "@/hooks/use-menu"
import { useOrders, Order } from "@/hooks/use-orders"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { cn, formatCurrency } from "@/lib/utils" // Note: formatCurrency needs implementation or I'll inline

// Inline helpers
const formatPrice = (price: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price);

type CartItem = MenuItem & { quantity: number; notes: string }

export default function POSPage() {
    const { storeId } = useParams()
    const { menuItems, loading: loadingMenu } = useMenu(storeId as string)
    const { orders: activeOrders, refresh: refreshOrders, updateStatus } = useOrders(storeId as string)

    const [activeTab, setActiveTab] = useState<'menu' | 'orders'>('menu')
    const [cart, setCart] = useState<CartItem[]>([])
    const [selectedCategory, setSelectedCategory] = useState<string>('All')
    const [searchQuery, setSearchQuery] = useState("")
    const [tableNumber, setTableNumber] = useState("")
    const [customerName, setCustomerName] = useState("")
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

    // Totals
    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0)
    const tip = parseFloat(tipAmount) || 0
    const total = subtotal + tip

    // Submit Order
    const handlePlaceOrder = async () => {
        if (cart.length === 0 || !storeId) return
        setSubmitting(true)
        try {
            // 1. Create Order
            const { data: orderData, error: orderError } = await supabase
                .from('orders')
                .insert([{
                    store_id: storeId,
                    table_number: tableNumber || 'Counter',
                    customer_name: customerName,
                    status: 'queue',
                    total_amount: total,
                    notes: '' // Could add general notes
                }])
                .select()
                .single()

            if (orderError) throw orderError

            // 2. Create Order Items
            const orderItems = cart.map(item => ({
                order_id: orderData.id,
                menu_item_id: item.id,
                quantity: item.quantity,
                price_at_time: item.price,
                notes: item.notes
            }))

            const { error: itemsError } = await supabase
                .from('order_items')
                .insert(orderItems)

            if (itemsError) throw itemsError

            // Reset
            setCart([])
            setTableNumber("")
            setCustomerName("")
            setTipAmount("0")
            setActiveTab('orders') // Switch to see the order
            refreshOrders() // Verify update

        } catch (error) {
            console.error("Error placing order:", error)
            alert("Failed to place order. See console.")
        } finally {
            setSubmitting(false)
        }
    }

    // Pay Order Logic (Active Orders Tab)
    const handleMarkPaid = async (orderId: string) => {
        await updateStatus(orderId, 'paid')
        refreshOrders()
    }

    return (
        <div className="h-[calc(100vh-6rem)] flex gap-6">

            {/* Left Panel: Content */}
            <div className="flex-1 flex flex-col gap-4">
                {/* Header / Tabs */}
                <div className="flex items-center gap-4 bg-card p-3 rounded-lg border shadow-sm">
                    <Button
                        variant={activeTab === 'menu' ? 'default' : 'ghost'}
                        onClick={() => setActiveTab('menu')}
                        className="gap-2"
                    >
                        <Utensils className="w-4 h-4" /> New Order
                    </Button>
                    <Button
                        variant={activeTab === 'orders' ? 'default' : 'ghost'}
                        onClick={() => setActiveTab('orders')}
                        className="gap-2"
                    >
                        <ListOrdered className="w-4 h-4" /> Active Orders
                    </Button>
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
                                                {/* Placeholder image logic */}
                                                {item.image_url ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover rounded-md" /> : <Coffee className="w-8 h-8 opacity-20" />}
                                            </div>
                                            <div className="flex items-start justify-between gap-2 mt-auto">
                                                <div className="font-medium truncate">{item.name}</div>
                                                <div className="font-bold text-primary">{formatPrice(item.price)}</div>
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
                                    <div className="font-bold text-lg">Table {order.table_number}</div>
                                    <div className="text-sm text-muted-foreground">#{order.order_number || order.id.slice(0, 4)} • {order.status.toUpperCase()}</div>
                                    <div className="mt-2 text-sm">
                                        {order.items?.map((item, i) => (
                                            <div key={i}>{item.quantity}x {item.menu_items?.name}</div>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-2 justify-center">
                                    <div className="text-xl font-bold">{formatPrice(order.total_amount || 0)}</div>
                                    <Button
                                        size="sm"
                                        onClick={() => handleMarkPaid(order.id)}
                                        disabled={order.status === 'paid'}
                                    >
                                        {order.status === 'paid' ? 'Paid' : 'Mark as Paid'}
                                    </Button>
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
                            <ShoppingBag className="w-5 h-5" /> Current Order
                        </h2>
                    </div>

                    <div className="p-4 grid gap-4 bg-muted/10">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-xs">Table No.</Label>
                                <Input
                                    value={tableNumber}
                                    onChange={e => setTableNumber(e.target.value)}
                                    placeholder="#"
                                    className="h-8"
                                />
                            </div>
                            <div>
                                <Label className="text-xs">Customer</Label>
                                <Input
                                    value={customerName}
                                    onChange={e => setCustomerName(e.target.value)}
                                    placeholder="Name"
                                    className="h-8"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                        {cart.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-2 opacity-50">
                                <ShoppingBag className="w-12 h-12" />
                                <p>Cart is empty</p>
                            </div>
                        ) : (
                            cart.map(item => (
                                <div key={item.id} className="flex gap-2">
                                    <div className="flex-1">
                                        <div className="flex justify-between font-medium text-sm">
                                            <span>{item.name}</span>
                                            <span>{formatPrice(item.price * item.quantity)}</span>
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
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Subtotal</span>
                                <span>{formatPrice(subtotal)}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm gap-4">
                                <span className="text-muted-foreground">Tip</span>
                                <div className="relative w-20">
                                    <span className="absolute left-2 top-1.5 text-xs text-muted-foreground">$</span>
                                    <Input
                                        className="h-7 pl-4 text-right"
                                        value={tipAmount}
                                        onChange={e => setTipAmount(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="flex justify-between font-bold text-lg pt-2 border-t">
                                <span>Total</span>
                                <span>{formatPrice(total)}</span>
                            </div>
                        </div>

                        <Button className="w-full gap-2" size="lg" disabled={cart.length === 0 || submitting} onClick={handlePlaceOrder}>
                            {submitting ? "Processing..." : (
                                <>
                                    <CreditCard className="w-4 h-4" /> Place Order
                                </>
                            )}
                        </Button>
                    </div>
                </Card>
            )}
        </div>
    )
}
