"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Search, Plus, Minus, Trash2, CreditCard, Utensils, Coffee, ListOrdered, Edit, Settings, Box, ShoppingCart } from "lucide-react"
import { useMenu, MenuItem, ModifierGroup, ModifierOption } from "@/hooks/use-menu"
import { useOrders, Order, OrderItemModifierSelection } from "@/hooks/use-orders"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MenuManager } from "@/components/menu-manager"
import { formatCurrency, cn } from "@/lib/utils"

const PLATE_MARKER_RE = /^\[PLATE:(\d+)\]\s*/

const decodePlateNotes = (raw: string | null | undefined) => {
    const notes = (raw || "").toString()
    const m = notes.match(PLATE_MARKER_RE)
    if (!m) return { plate: 1, notes }
    const plate = Math.max(1, parseInt(m[1] || "1", 10) || 1)
    return { plate, notes: notes.replace(PLATE_MARKER_RE, "") }
}

const encodePlateNotes = (plate: number, userNotes: string) => {
    const clean = (userNotes || "").trim()
    return clean ? `[PLATE:${plate}] ${clean}` : `[PLATE:${plate}]`
}

const newLineId = () => {
    // crypto.randomUUID is available in modern browsers; fall back for safety.
    const cryptoObj = globalThis.crypto as Crypto | undefined
    return cryptoObj?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

type CartItem = MenuItem & { lineId: string; plate: number; quantity: number; notes: string; original_order_item_id?: string }

type CartItemWithMods = CartItem & { modifiers?: OrderItemModifierSelection[] }

const stableStringify = (value: unknown) => {
    const seen = new WeakSet<object>()
    const sorter = (v: unknown): unknown => {
        if (v === null || typeof v !== 'object') return v
        const obj = v as object
        if (seen.has(obj)) return null
        seen.add(obj)
        if (Array.isArray(v)) return v.map(sorter)
        const rec = v as Record<string, unknown>
        const out: Record<string, unknown> = {}
        for (const k of Object.keys(rec).sort()) out[k] = sorter(rec[k])
        return out
    }
    return JSON.stringify(sorter(value))
}

const modifiersExtra = (mods: OrderItemModifierSelection[] | null | undefined) => {
    const m = mods || []
    let total = 0
    for (const g of m) {
        if ((g.mode || 'count') === 'per_piece') {
            for (const p of g.pieces || []) {
                for (const s of p.selections || []) {
                    total += (s.price_delta || 0) * (s.quantity || 0)
                }
            }
        } else {
            for (const s of g.selections || []) {
                total += (s.price_delta || 0) * (s.quantity || 0)
            }
        }
    }
    return total
}

const cartItemUnitPrice = (item: CartItemWithMods) => (item.price || 0) + modifiersExtra(item.modifiers)

const formatModifiersSummary = (mods: OrderItemModifierSelection[] | null | undefined) => {
    const m = (mods || []).filter(g => {
        if ((g.mode || 'count') === 'per_piece') {
            return (g.pieces || []).some(p => (p.selections || []).some(s => (s.quantity || 0) > 0))
        }
        return (g.selections || []).some(s => (s.quantity || 0) > 0)
    })
    if (m.length === 0) return ''
    return m
        .map(g => {
            if ((g.mode || 'count') === 'per_piece') {
                const pieces = (g.pieces || []).map(p => {
                    const parts = (p.selections || [])
                        .filter(s => (s.quantity || 0) > 0)
                        .map(s => (s.quantity || 0) > 1 ? `${s.option_name} x${s.quantity}` : s.option_name)
                    return `${p.label}: ${parts.join(', ')}`
                })
                return `${g.group_name}: ${pieces.join(' • ')}`
            }

            const parts = (g.selections || [])
                .filter(s => (s.quantity || 0) > 0)
                .map(s => (s.quantity || 0) > 1 ? `${s.option_name} x${s.quantity}` : s.option_name)
            return `${g.group_name}: ${parts.join(', ')}`
        })
        .join(' • ')
}

export default function POSPage() {
    const { storeId } = useParams()
    const { menuItems, loading: loadingMenu } = useMenu(storeId as string)
    const { orders: activeOrders, refresh: refreshOrders, updateStatus } = useOrders(storeId as string)

    const [activeTab, setActiveTab] = useState<'menu' | 'orders' | 'history'>('menu')
    const [cart, setCart] = useState<CartItemWithMods[]>([])
    const [plateCount, setPlateCount] = useState(1)
    const [selectedPlate, setSelectedPlate] = useState(1)
    const [selectedCategory, setSelectedCategory] = useState<string>('All')
    const [searchQuery, setSearchQuery] = useState("")
    const [tableNumber, setTableNumber] = useState("")
    const [editingOrderId, setEditingOrderId] = useState<string | null>(null)

    const [paymentOrder, setPaymentOrder] = useState<Order | null>(null)
    const [tipAmount, setTipAmount] = useState<string>("0")

    const [cartOpen, setCartOpen] = useState(false)
    const [showCartSidebar, setShowCartSidebar] = useState(true)

    const [submitting, setSubmitting] = useState(false)
    const [historyOrders, setHistoryOrders] = useState<Order[]>([])
    const [storeData, setStoreData] = useState<any>(null)

    // Terminal States
    const [isTerminalLoading, setIsTerminalLoading] = useState(false)
    const [terminalStatus, setTerminalStatus] = useState<string | null>(null)
    const [terminalSelectionOpen, setTerminalSelectionOpen] = useState(false)

    // Fetch store info
    useEffect(() => {
        if (storeId) {
            supabase.from('stores').select('*').eq('id', storeId).single().then(({ data }) => setStoreData(data))
        }
    }, [storeId])

    // Fetch history
    useEffect(() => {
        if (activeTab === 'history' && storeId) {
            const fetchHistory = async () => {
                const { data } = await supabase
                    .from('orders')
                    .select('*, items:order_items(*, menu_items(*))')
                    .eq('store_id', storeId)
                    .in('status', ['paid', 'cancelled'])
                    .order('created_at', { ascending: false })
                    .limit(50)
                if (data) setHistoryOrders(data)
            }
            fetchHistory()
        }
    }, [activeTab, storeId])

    // Categories derivation
    const categories = ['All', ...Array.from(new Set(menuItems.map(i => i.category)))]

    // Filter Logic
    const filteredItems = menuItems.filter(item => {
        const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase())
        return matchesCategory && matchesSearch
    })

    // Cart Logic
    const addToCart = (item: MenuItem, modifiers?: OrderItemModifierSelection[]) => {
        setCart(prev => {
            const existing = prev.find(i =>
                i.id === item.id &&
                i.plate === selectedPlate &&
                i.notes === '' &&
                stableStringify(i.modifiers || []) === stableStringify(modifiers || [])
            )
            if (existing) {
                return prev.map(i => i.lineId === existing.lineId ? { ...i, quantity: i.quantity + 1 } : i)
            }
            return [...prev, { ...item, lineId: newLineId(), plate: selectedPlate, quantity: 1, notes: '', modifiers: modifiers || [] }]
        })
    }

    const beginAddItem = (item: MenuItem) => {
        const groups = (item.modifier_groups || []).filter(Boolean) as ModifierGroup[]
        if (groups.length === 0) {
            addToCart(item)
            return
        }

        const initial: Record<string, Record<string, number>> = {}
        const initialPieces: Record<string, string[][]> = {}
        for (const g of groups) {
            initial[g.id] = {}
            for (const o of (g.options || [])) {
                initial[g.id][o.id] = 0
            }

            if ((g.mode || 'count') === 'per_piece') {
                const pieceCount = Math.max(1, (g.piece_count ?? (Number.isFinite(g.max) ? g.max : g.min) ?? 1) as number)
                initialPieces[g.id] = Array.from({ length: pieceCount }, () => [])
            }
        }

        setConfigItem(item)
        setConfigCounts(initial)
        setConfigPieces(initialPieces)
        setConfigOpen(true)
    }

    const updateQuantity = (lineId: string, delta: number) => {
        setCart(prev => prev.map(i => {
            if (i.lineId === lineId) return { ...i, quantity: Math.max(1, i.quantity + delta) }
            return i
        }))
    }

    const removeFromCart = (lineId: string) => {
        setCart(prev => prev.filter(i => i.lineId !== lineId))
    }

    const moveToPlate = (lineId: string, nextPlate: number) => {
        setCart(prev => {
            const moving = prev.find(i => i.lineId === lineId)
            if (!moving) return prev
            if (moving.plate === nextPlate) return prev

            const updated = prev.map(i => i.lineId === lineId ? { ...i, plate: nextPlate } : i)
            const moved = { ...moving, plate: nextPlate }

            const duplicate = updated.find(i =>
                i.lineId !== lineId &&
                i.id === moved.id &&
                i.plate === moved.plate &&
                i.notes === moved.notes &&
                stableStringify(i.modifiers || []) === stableStringify(moved.modifiers || [])
            )
            if (!duplicate) return updated

            return updated
                .filter(i => i.lineId !== lineId)
                .map(i => i.lineId === duplicate.lineId ? { ...i, quantity: i.quantity + moved.quantity } : i)
        })
    }

    // Totals for Cart
    const subtotal = cart.reduce((acc, item) => acc + (cartItemUnitPrice(item) * item.quantity), 0)
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
                // Group by MenuItemID + Plate + Notes (so plates can be edited/moved cleanly)

                type ExistingItem = NonNullable<typeof existingItems>[number]
                const existingMap = new Map<string, ExistingItem[]>()

                existingItems?.forEach(item => {
                    const decoded = decodePlateNotes(item.notes)
                    const dbMods = (item as unknown as { modifiers?: OrderItemModifierSelection[] }).modifiers || []
                    const key = `${item.menu_item_id}|${decoded.plate}|${decoded.notes.trim()}|${stableStringify(dbMods)}`
                    const list = existingMap.get(key) || []
                    list.push(item)
                    existingMap.set(key, list)
                })

                const itemsToInsert: Array<{
                    order_id: string
                    menu_item_id: string
                    quantity: number
                    price_at_time: number
                    notes: string
                    status: 'active'
                    modifiers?: OrderItemModifierSelection[]
                }> = []
                const itemsToUpdate: Array<{ id: string; quantity: number }> = []
                const explicitCancels: string[] = []

                // Process Cart Items
                for (const cartItem of cart) {
                    const key = `${cartItem.id}|${cartItem.plate}|${(cartItem.notes || '').trim()}|${stableStringify(cartItem.modifiers || [])}`
                    const currentItems = existingMap.get(key) || []
                    const currentQty = currentItems.reduce((sum, i) => sum + i.quantity, 0)
                    const targetQty = cartItem.quantity

                    const diff = targetQty - currentQty

                    if (diff > 0) {
                        // ADD-ON: Insert NEW row for the difference
                        itemsToInsert.push({
                            order_id: orderId,
                            menu_item_id: cartItem.id,
                            quantity: diff,
                            price_at_time: cartItemUnitPrice(cartItem),
                            notes: encodePlateNotes(cartItem.plate, cartItem.notes),
                            status: 'active',
                            modifiers: cartItem.modifiers || []
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
                    existingMap.delete(key)
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
                const grouped = new Map<string, { menu_item_id: string; quantity: number; price_at_time: number; notes: string; modifiers: OrderItemModifierSelection[] }>()
                for (const item of cart) {
                    const key = `${item.id}|${item.plate}|${(item.notes || '').trim()}|${stableStringify(item.modifiers || [])}`
                    const existing = grouped.get(key)
                    if (existing) {
                        existing.quantity += item.quantity
                    } else {
                        grouped.set(key, {
                            menu_item_id: item.id,
                            quantity: item.quantity,
                            price_at_time: cartItemUnitPrice(item),
                            notes: encodePlateNotes(item.plate, item.notes),
                            modifiers: item.modifiers || [],
                        })
                    }
                }

                const orderItems = Array.from(grouped.values()).map((g) => ({
                    order_id: orderId,
                    menu_item_id: g.menu_item_id,
                    quantity: g.quantity,
                    price_at_time: g.price_at_time,
                    notes: g.notes,
                    status: 'active',
                    modifiers: g.modifiers,
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
        setPlateCount(1)
        setSelectedPlate(1)
    }

    const handleEditOrder = (order: Order) => {
        // Aggregate items by menu_item_id + plate + notes
        const aggregatedItems = new Map<string, CartItemWithMods>()
        let maxPlate = 1

        if (order.items) {
            order.items.forEach(item => {
                if (item.status === 'cancelled') return

                const decoded = decodePlateNotes(item.notes)
                maxPlate = Math.max(maxPlate, decoded.plate)
                const key = `${item.menu_item_id}|${decoded.plate}|${decoded.notes.trim()}|${stableStringify(item.modifiers || [])}`
                const existing = aggregatedItems.get(key)
                if (existing) {
                    existing.quantity += item.quantity
                    // Keep notes stable for the group.
                } else {
                    const menuItem = menuItems.find(m => m.id === item.menu_item_id)
                    if (!menuItem) return

                    aggregatedItems.set(key, {
                        ...menuItem,
                        lineId: newLineId(),
                        plate: decoded.plate,
                        quantity: item.quantity,
                        notes: decoded.notes || '',
                        modifiers: item.modifiers || [],
                    })
                }
            })
        }

        setCart(Array.from(aggregatedItems.values()))
        setPlateCount(Math.max(1, maxPlate))
        setSelectedPlate(1)
        setTableNumber(order.table_number)
        setEditingOrderId(order.id)
        setActiveTab('menu')
    }

    // Configurable item state
    const [configOpen, setConfigOpen] = useState(false)
    const [configItem, setConfigItem] = useState<MenuItem | null>(null)
    const [configCounts, setConfigCounts] = useState<Record<string, Record<string, number>>>({})
    const [configPieces, setConfigPieces] = useState<Record<string, string[][]>>({})

    // Fetch history
    useEffect(() => {
        if (activeTab === 'history' && storeId) {
            const fetchHistory = async () => {
                const { data } = await supabase
                    .from('orders')
                    .select('*, items:order_items(*, menu_items(*))')
                    .eq('store_id', storeId)
                    .in('status', ['paid', 'cancelled'])
                    .order('created_at', { ascending: false })
                    .limit(50)
                if (data) setHistoryOrders(data)
            }
            fetchHistory()
        }
    }, [activeTab, storeId])

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
        const finalTotal = (paymentOrder.total_amount || 0) + tip

        const { error } = await supabase
            .from('orders')
            .update({
                status: 'paid',
                total_amount: finalTotal,
                tip_amount: tip // Save raw tip amount
            })
            .eq('id', paymentOrder.id)

        if (error) {
            console.error(error)
            return
        }

        setPaymentOrder(null)
        refreshOrders()
    }

    const handleTerminalPayment = async (deviceId: string) => {
        if (!paymentOrder) return

        setTerminalSelectionOpen(false)
        setIsTerminalLoading(true)
        setTerminalStatus("Initializing terminal...")

        try {
            const tip = parseFloat(tipAmount) || 0
            const totalToPay = (paymentOrder.total_amount || 0) + tip

            const res = await fetch('/api/mercadopago/point', {
                method: 'POST',
                body: JSON.stringify({
                    amount: totalToPay,
                    orderId: paymentOrder.id,
                    deviceId: deviceId
                })
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Failed to start terminal payment")

            const intentId = data.id
            setTerminalStatus("Tap or Swipe card on terminal...")

            // Start Polling
            let attempts = 0
            const interval = setInterval(async () => {
                attempts++
                try {
                    const statusRes = await fetch(`/api/mercadopago/point?deviceId=${deviceId}&paymentIntentId=${intentId}`)
                    const statusData = await statusRes.json()

                    if (statusData.status === 'FINISHED' || statusData.status === 'CLOSED') {
                        clearInterval(interval)
                        setTerminalStatus("Payment Approved!")
                        setIsTerminalLoading(false)
                        handleConfirmPayment()
                    } else if (statusData.status === 'CANCELED' || statusData.status === 'EXPIRED') {
                        clearInterval(interval)
                        setTerminalStatus("Payment Failed: " + statusData.status)
                        setIsTerminalLoading(false)
                    }
                } catch (e) {
                    console.error("Polling error", e)
                }

                if (attempts > 120) { // 10 minutes
                    clearInterval(interval)
                    setTerminalStatus("Payment Timeout")
                    setIsTerminalLoading(false)
                }
            }, 5000)

        } catch (err: any) {
            alert(err.message)
            setIsTerminalLoading(false)
            setTerminalStatus(null)
        }
    }

    const triggerTerminalPayment = () => {
        const devices = Array.isArray(storeData?.mp_devices) ? storeData.mp_devices : []
        const fallbackId = storeData?.mp_device_id

        if (devices.length > 1) {
            setTerminalSelectionOpen(true)
        } else if (devices.length === 1) {
            handleTerminalPayment(devices[0].id)
        } else if (fallbackId) {
            handleTerminalPayment(fallbackId)
        } else {
            alert("No terminal configured. Please add one in settings.")
        }
    }

    return (
        <div className="min-h-[calc(100vh-6rem)] flex flex-col lg:flex-row gap-4 lg:gap-6">

            {/* Left Panel: Content */}
            <div className="flex-1 flex flex-col gap-4">
                {/* Header / Tabs */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-card p-3 rounded-lg border shadow-sm">
                    <div className="flex flex-wrap gap-2">
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
                        <Button
                            variant={activeTab === 'history' ? 'default' : 'ghost'}
                            onClick={() => {
                                if (editingOrderId) {
                                    if (confirm("Discard changes to currently editing order?")) resetCart()
                                    else return
                                }
                                setActiveTab('history')
                            }}
                            className="gap-2"
                        >
                            <Box className="w-4 h-4" /> History
                        </Button>
                    </div>

                    <div className="flex items-center gap-2">
                        {activeTab === 'menu' && (
                            <>
                                <Button
                                    variant="default"
                                    size="sm"
                                    className="gap-2 lg:hidden transition-colors"
                                    onClick={() => setCartOpen(true)}
                                >
                                    <ShoppingCart className="w-4 h-4" /> Cart ({cart.length})
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-2 hidden lg:inline-flex"
                                    onClick={() => setShowCartSidebar(s => !s)}
                                >
                                    <ShoppingCart className="w-4 h-4" /> {showCartSidebar ? 'Hide Cart' : 'Show Cart'}
                                </Button>
                            </>
                        )}

                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="icon" aria-label="Open settings">
                                    <Settings className="w-4 h-4" />
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                                <MenuManager storeId={storeId as string} />
                            </DialogContent>
                        </Dialog>
                    </div>
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
                                        onClick={() => beginAddItem(item)}
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
                ) : activeTab === 'orders' ? (
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
                                            <div key={i} className="text-sm">
                                                <div>{item.quantity}x {item.menu_items?.name}</div>
                                                {formatModifiersSummary(item.modifiers) && (
                                                    <div className="text-xs text-muted-foreground ml-4">
                                                        {formatModifiersSummary(item.modifiers)}
                                                    </div>
                                                )}
                                            </div>
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
                ) : (
                    <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                        <div className="flex justify-between items-center pb-2 border-b">
                            <h3 className="font-semibold">Recent History</h3>
                            <span className="text-xs text-muted-foreground">Last 50 orders</span>
                        </div>
                        {historyOrders.length === 0 && <div className="text-center py-10 text-muted-foreground">No history found.</div>}
                        {historyOrders.map(order => (
                            <Card key={order.id} className="flex flex-col sm:flex-row justify-between p-4 gap-4 opacity-80">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <div className="font-bold text-lg">Table {order.table_number}</div>
                                        <span className={cn("text-xs px-2 py-0.5 rounded uppercase border",
                                            order.status === 'paid' ? "bg-green-100 text-green-800 border-green-200" : "bg-red-100 text-red-800 border-red-200"
                                        )}>
                                            {order.status}
                                        </span>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {new Date(order.created_at).toLocaleString()} • #{order.order_number || order.id.slice(0, 4)}
                                    </div>
                                    <div className="mt-2 text-sm">
                                        {order.items?.map((item, i) => (
                                            <div key={i} className="text-sm">
                                                <div>{item.quantity}x {item.menu_items?.name}</div>
                                                {formatModifiersSummary(item.modifiers) && (
                                                    <div className="text-xs text-muted-foreground ml-4">
                                                        {formatModifiersSummary(item.modifiers)}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-2 justify-center">
                                    <div className="text-xl font-bold">{formatCurrency(order.total_amount || 0)}</div>
                                    {(order.tip_amount || 0) > 0 && (
                                        <div className="text-xs text-muted-foreground italic">
                                            Tip: {formatCurrency(order.tip_amount || 0)}
                                        </div>
                                    )}
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Right Panel: Cart */}
            {activeTab === 'menu' && (
                <div
                    className={cn(
                        "hidden lg:block overflow-hidden transition-all duration-300",
                        showCartSidebar ? "w-96 opacity-100" : "w-0 opacity-0 pointer-events-none"
                    )}
                >
                    <Card className={cn("w-full flex flex-col shadow-lg border-l h-full", !showCartSidebar && "border-0 shadow-none")}>
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

                            <div className="space-y-2">
                                <Label className="text-xs">Plates</Label>
                                <div className="flex items-center gap-2">
                                    <Select value={String(selectedPlate)} onValueChange={(v) => setSelectedPlate(parseInt(v, 10) || 1)}>
                                        <SelectTrigger className="h-8">
                                            <SelectValue placeholder="Select plate" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {Array.from({ length: plateCount }, (_, idx) => idx + 1).map((p) => (
                                                <SelectItem key={p} value={String(p)}>
                                                    Plate {p}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setPlateCount(c => c + 1)
                                            setSelectedPlate(plateCount + 1)
                                        }}
                                    >
                                        + Plate
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                            {cart.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-2 opacity-50">
                                    <Utensils className="w-12 h-12" />
                                    <p>Cart is empty</p>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    {Array.from({ length: plateCount }, (_, idx) => idx + 1).map((plate) => {
                                        const plateItems = cart.filter(i => i.plate === plate)
                                        const plateTotal = plateItems.reduce((acc, i) => acc + (cartItemUnitPrice(i) * i.quantity), 0)

                                        return (
                                            <div key={plate} className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plate {plate}</div>
                                                    <div className="text-xs text-muted-foreground">{plateItems.length > 0 ? formatCurrency(plateTotal) : ''}</div>
                                                </div>

                                                {plateItems.length === 0 ? (
                                                    <div className="text-xs text-muted-foreground italic">No items</div>
                                                ) : (
                                                    <div className="space-y-3">
                                                        {plateItems.map(item => (
                                                            <div key={item.lineId} className="flex gap-2">
                                                                <div className="flex-1">
                                                                    <div className="flex justify-between font-medium text-sm">
                                                                        <span>{item.name}</span>
                                                                        <span>{formatCurrency(cartItemUnitPrice(item) * item.quantity)}</span>
                                                                    </div>
                                                                    {formatModifiersSummary(item.modifiers) && (
                                                                        <div className="text-xs text-muted-foreground mt-0.5">
                                                                            {formatModifiersSummary(item.modifiers)}
                                                                        </div>
                                                                    )}
                                                                    <div className="flex items-center gap-2 mt-1">
                                                                        <Button variant="outline" size="icon" className="h-6 w-6 rounded-full" onClick={() => updateQuantity(item.lineId, -1)}>
                                                                            <Minus className="w-3 h-3" />
                                                                        </Button>
                                                                        <span className="text-sm w-4 text-center">{item.quantity}</span>
                                                                        <Button variant="outline" size="icon" className="h-6 w-6 rounded-full" onClick={() => updateQuantity(item.lineId, 1)}>
                                                                            <Plus className="w-3 h-3" />
                                                                        </Button>

                                                                        <div className="ml-auto flex items-center gap-2">
                                                                            <Select value={String(item.plate)} onValueChange={(v) => moveToPlate(item.lineId, parseInt(v, 10) || 1)}>
                                                                                <SelectTrigger className="h-7 w-[110px] text-xs">
                                                                                    <SelectValue />
                                                                                </SelectTrigger>
                                                                                <SelectContent>
                                                                                    {Array.from({ length: plateCount }, (_, idx) => idx + 1).map((p) => (
                                                                                        <SelectItem key={p} value={String(p)}>
                                                                                            Plate {p}
                                                                                        </SelectItem>
                                                                                    ))}
                                                                                </SelectContent>
                                                                            </Select>

                                                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeFromCart(item.lineId)}>
                                                                                <Trash2 className="w-3 h-3" />
                                                                            </Button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
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
                </div>
            )}

            {/* Mobile Cart Dialog */}
            <Dialog open={cartOpen} onOpenChange={setCartOpen}>
                <DialogContent className="max-w-md p-0 duration-300">
                    <div className="max-h-[80vh] overflow-hidden">
                        <Card className="w-full flex flex-col shadow-none border-0 rounded-none">
                            <div className="p-4 border-b bg-muted/20">
                                <h2 className="font-semibold flex items-center gap-2">
                                    <ShoppingCart className="w-4 h-4" /> Cart
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

                                <div className="space-y-2">
                                    <Label className="text-xs">Add to plate</Label>
                                    <div className="flex items-center gap-2">
                                        <Select value={String(selectedPlate)} onValueChange={(v) => setSelectedPlate(parseInt(v, 10) || 1)}>
                                            <SelectTrigger className="h-8">
                                                <SelectValue placeholder="Select plate" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Array.from({ length: plateCount }, (_, idx) => idx + 1).map((p) => (
                                                    <SelectItem key={p} value={String(p)}>
                                                        Plate {p}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setPlateCount(c => c + 1)
                                                setSelectedPlate(plateCount + 1)
                                            }}
                                        >
                                            + Plate
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                                {cart.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-2 opacity-50">
                                        <Utensils className="w-12 h-12" />
                                        <p>Cart is empty</p>
                                    </div>
                                ) : (
                                    <div className="space-y-5">
                                        {Array.from({ length: plateCount }, (_, idx) => idx + 1).map((plate) => {
                                            const plateItems = cart.filter(i => i.plate === plate)
                                            const plateTotal = plateItems.reduce((acc, i) => acc + (cartItemUnitPrice(i) * i.quantity), 0)

                                            return (
                                                <div key={plate} className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plate {plate}</div>
                                                        <div className="text-xs text-muted-foreground">{plateItems.length > 0 ? formatCurrency(plateTotal) : ''}</div>
                                                    </div>

                                                    {plateItems.length === 0 ? (
                                                        <div className="text-xs text-muted-foreground italic">No items</div>
                                                    ) : (
                                                        <div className="space-y-3">
                                                            {plateItems.map(item => (
                                                                <div key={item.lineId} className="flex gap-2">
                                                                    <div className="flex-1">
                                                                        <div className="flex justify-between font-medium text-sm">
                                                                            <span>{item.name}</span>
                                                                            <span>{formatCurrency(cartItemUnitPrice(item) * item.quantity)}</span>
                                                                        </div>
                                                                        {formatModifiersSummary(item.modifiers) && (
                                                                            <div className="text-xs text-muted-foreground mt-0.5">
                                                                                {formatModifiersSummary(item.modifiers)}
                                                                            </div>
                                                                        )}
                                                                        <div className="flex items-center gap-2 mt-1">
                                                                            <Button variant="outline" size="icon" className="h-6 w-6 rounded-full" onClick={() => updateQuantity(item.lineId, -1)}>
                                                                                <Minus className="w-3 h-3" />
                                                                            </Button>
                                                                            <span className="text-sm w-4 text-center">{item.quantity}</span>
                                                                            <Button variant="outline" size="icon" className="h-6 w-6 rounded-full" onClick={() => updateQuantity(item.lineId, 1)}>
                                                                                <Plus className="w-3 h-3" />
                                                                            </Button>

                                                                            <div className="ml-auto flex items-center gap-2">
                                                                                <Select value={String(item.plate)} onValueChange={(v) => moveToPlate(item.lineId, parseInt(v, 10) || 1)}>
                                                                                    <SelectTrigger className="h-7 w-[110px] text-xs">
                                                                                        <SelectValue />
                                                                                    </SelectTrigger>
                                                                                    <SelectContent>
                                                                                        {Array.from({ length: plateCount }, (_, idx) => idx + 1).map((p) => (
                                                                                            <SelectItem key={p} value={String(p)}>
                                                                                                Plate {p}
                                                                                            </SelectItem>
                                                                                        ))}
                                                                                    </SelectContent>
                                                                                </Select>

                                                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeFromCart(item.lineId)}>
                                                                                    <Trash2 className="w-3 h-3" />
                                                                                </Button>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
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
                                    <Button
                                        className="flex-1 gap-2"
                                        size="lg"
                                        disabled={cart.length === 0 || submitting}
                                        onClick={async () => {
                                            await handlePlaceOrder()
                                            setCartOpen(false)
                                        }}
                                    >
                                        {submitting ? "Processing..." : (
                                            editingOrderId ? "Update Order" : "Place Order"
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Configurable Item Dialog */}
            <Dialog
                open={configOpen}
                onOpenChange={(open) => {
                    setConfigOpen(open)
                    if (!open) {
                        setConfigItem(null)
                        setConfigCounts({})
                        setConfigPieces({})
                    }
                }}
            >
                <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle>{configItem?.name || 'Customize item'}</DialogTitle>
                        <DialogDescription>Select the required options to add this item.</DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto pr-2">
                        {(() => {
                            const item = configItem
                            const groups = (item?.modifier_groups || []).filter(Boolean) as ModifierGroup[]
                            if (!item || groups.length === 0) {
                                return <div className="text-sm text-muted-foreground">No customizable options.</div>
                            }

                            const isPerPieceGroup = (g: ModifierGroup) => (g.mode || 'count') === 'per_piece'

                            const groupTotals = new Map<string, number>()
                            for (const g of groups) {
                                if (isPerPieceGroup(g)) continue
                                const counts = configCounts[g.id] || {}
                                groupTotals.set(g.id, Object.values(counts).reduce((a, b) => a + (b || 0), 0))
                            }

                            const isGroupSatisfied = (g: ModifierGroup) => {
                                if (isPerPieceGroup(g)) {
                                    const pieceCount = Math.max(1, Number(g.piece_count ?? (Number.isFinite(g.max) ? g.max : g.min) ?? 1))
                                    const minPerPiece = typeof g.min_per_piece === 'number' ? g.min_per_piece : 1
                                    const pieces = configPieces[g.id] || []
                                    if (pieces.length !== pieceCount) return false
                                    return pieces.every((piece) => (piece?.length || 0) >= minPerPiece)
                                }
                                const totalSelected = groupTotals.get(g.id) || 0
                                const min = typeof g.min === 'number' ? g.min : 0
                                const max = typeof g.max === 'number' ? g.max : min
                                if (min === max) return totalSelected === max
                                return totalSelected >= min && totalSelected <= max
                            }

                            const allSatisfied = groups.every(isGroupSatisfied)

                            const snapshot: OrderItemModifierSelection[] = groups.map((g: ModifierGroup) => {
                                if (isPerPieceGroup(g)) {
                                    const pieceCount = Math.max(1, Number(g.piece_count ?? (Number.isFinite(g.max) ? g.max : g.min) ?? 1))
                                    const labelBase = (g.piece_label || 'Piece').trim() || 'Piece'
                                    const piecesRaw = configPieces[g.id] || []
                                    const pieces = Array.from({ length: pieceCount }, (_, i) => {
                                        const ids = piecesRaw[i] || []
                                        const perOption: Record<string, number> = {}
                                        for (const id of ids) perOption[id] = (perOption[id] || 0) + 1
                                        return {
                                            label: `${labelBase} ${i + 1}`,
                                            selections: (g.options || [])
                                                .map((o: ModifierOption) => ({
                                                    option_id: o.id,
                                                    option_name: o.name,
                                                    price_delta: Number(o.price_delta || 0),
                                                    quantity: Number(perOption[o.id] || 0),
                                                }))
                                                .filter((x) => x.quantity > 0),
                                        }
                                    })

                                    return {
                                        group_id: g.id,
                                        group_name: g.name,
                                        mode: 'per_piece',
                                        pieces,
                                        selections: [],
                                    }
                                }

                                const counts = configCounts[g.id] || {}
                                return {
                                    group_id: g.id,
                                    group_name: g.name,
                                    mode: 'count',
                                    selections: (g.options || [])
                                        .map((o: ModifierOption) => ({
                                            option_id: o.id,
                                            option_name: o.name,
                                            price_delta: Number(o.price_delta || 0),
                                            quantity: Number(counts[o.id] || 0),
                                        }))
                                        .filter((x) => x.quantity > 0),
                                }
                            })

                            const extra = modifiersExtra(snapshot)
                            const unit = (item.price || 0) + extra

                            return (
                                <div className="space-y-4">
                                    {groups.map((g: ModifierGroup) => {
                                        if (isPerPieceGroup(g)) {
                                            const pieceCount = Math.max(1, Number(g.piece_count ?? (Number.isFinite(g.max) ? g.max : g.min) ?? 1))
                                            const labelBase = (g.piece_label || 'Piece').trim() || 'Piece'
                                            const minPerPiece = typeof g.min_per_piece === 'number' ? g.min_per_piece : 1
                                            const pieces = configPieces[g.id] || []
                                            const satisfiedCount = pieces.filter(p => (p?.length || 0) >= minPerPiece).length

                                            const ruleText = `Pick at least ${minPerPiece} per ${labelBase}`
                                            const statusTone = satisfiedCount === pieceCount ? "text-green-600" : "text-amber-600"

                                            return (
                                                <div key={g.id} className="rounded-md border p-3 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <div className="font-medium">{g.name}</div>
                                                            <div className="text-xs text-muted-foreground">{ruleText}</div>
                                                        </div>
                                                        <div className={cn("text-xs font-medium", statusTone)}>
                                                            {Math.min(satisfiedCount, pieceCount)}/{pieceCount}
                                                        </div>
                                                    </div>

                                                    <div className="space-y-3">
                                                        {Array.from({ length: pieceCount }, (_, pieceIdx) => {
                                                            const ids = pieces[pieceIdx] || []
                                                            const perOption: Record<string, number> = {}
                                                            for (const id of ids) perOption[id] = (perOption[id] || 0) + 1
                                                            const pieceSelected = ids.length
                                                            const pieceTone = pieceSelected >= minPerPiece ? "text-green-600" : "text-amber-600"
                                                            return (
                                                                <div key={pieceIdx} className="rounded-md border bg-muted/20 p-2 space-y-2">
                                                                    <div className="flex items-center justify-between">
                                                                        <div className="text-sm font-medium">{labelBase} {pieceIdx + 1}</div>
                                                                        <div className={cn("text-xs font-medium", pieceTone)}>
                                                                            {pieceSelected}/{minPerPiece}
                                                                        </div>
                                                                    </div>

                                                                    <div className="space-y-2">
                                                                        {(g.options || [])
                                                                            .filter((o: ModifierOption) => (o.available ?? true))
                                                                            .map((o: ModifierOption) => {
                                                                                const c = Number(perOption[o.id] || 0)
                                                                                return (
                                                                                    <div key={o.id} className="flex items-center justify-between gap-2">
                                                                                        <div className="flex-1">
                                                                                            <div className="text-sm font-medium">{o.name}</div>
                                                                                            {!!Number(o.price_delta || 0) && (
                                                                                                <div className="text-xs text-muted-foreground">+{formatCurrency(Number(o.price_delta || 0))}</div>
                                                                                            )}
                                                                                        </div>
                                                                                        <div className="flex items-center gap-2">
                                                                                            <Button
                                                                                                type="button"
                                                                                                variant="outline"
                                                                                                size="icon"
                                                                                                className="h-7 w-7 rounded-full"
                                                                                                disabled={c <= 0}
                                                                                                onClick={() => {
                                                                                                    setConfigPieces(prev => {
                                                                                                        const next = { ...prev }
                                                                                                        const arr = (next[g.id] || []).map(p => [...p])
                                                                                                        const before = arr[pieceIdx] || []
                                                                                                        const idx = before.lastIndexOf(o.id)
                                                                                                        if (idx >= 0) {
                                                                                                            before.splice(idx, 1)
                                                                                                        }
                                                                                                        arr[pieceIdx] = before
                                                                                                        next[g.id] = arr
                                                                                                        return next
                                                                                                    })
                                                                                                }}
                                                                                            >
                                                                                                <Minus className="w-3 h-3" />
                                                                                            </Button>
                                                                                            <div className="w-6 text-center text-sm">{c}</div>
                                                                                            <Button
                                                                                                type="button"
                                                                                                variant="outline"
                                                                                                size="icon"
                                                                                                className="h-7 w-7 rounded-full"
                                                                                                onClick={() => {
                                                                                                    setConfigPieces(prev => {
                                                                                                        const next = { ...prev }
                                                                                                        const arr = (next[g.id] || []).map(p => [...p])
                                                                                                        const before = arr[pieceIdx] || []
                                                                                                        before.push(o.id)
                                                                                                        arr[pieceIdx] = before
                                                                                                        next[g.id] = arr
                                                                                                        return next
                                                                                                    })
                                                                                                }}
                                                                                            >
                                                                                                <Plus className="w-3 h-3" />
                                                                                            </Button>
                                                                                        </div>
                                                                                    </div>
                                                                                )
                                                                            })}
                                                                    </div>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            )
                                        }

                                        const counts = configCounts[g.id] || {}
                                        const totalSelected = groupTotals.get(g.id) || 0
                                        const min = typeof g.min === 'number' ? g.min : 0
                                        const max = typeof g.max === 'number' ? g.max : min

                                        const ruleText = (() => {
                                            if (min === max) return `Select exactly ${max}`
                                            if (min === 0) return `Select up to ${max}`
                                            return `Select ${min}–${max}`
                                        })()

                                        const statusText = (() => {
                                            if (min === max) return `${totalSelected}/${max}`
                                            return `${totalSelected}/${max}`
                                        })()

                                        const statusTone = (() => {
                                            if (totalSelected < min) return "text-amber-600"
                                            if (totalSelected > max) return "text-destructive"
                                            if (totalSelected >= min && totalSelected <= max) {
                                                // For exact groups, satisfied is exact; for ranged groups, satisfied is within range.
                                                const exactOk = (min === max) ? (totalSelected === max) : true
                                                return exactOk ? "text-green-600" : "text-muted-foreground"
                                            }
                                            return "text-muted-foreground"
                                        })()

                                        return (
                                            <div key={g.id} className="rounded-md border p-3 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <div className="font-medium">{g.name}</div>
                                                        <div className="text-xs text-muted-foreground">{ruleText}</div>
                                                    </div>
                                                    <div className={cn("text-xs font-medium", statusTone)}>
                                                        {statusText}
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    {(g.options || [])
                                                        .filter((o: ModifierOption) => (o.available ?? true))
                                                        .map((o: ModifierOption) => {
                                                            const c = Number(counts[o.id] || 0)
                                                            const canInc = totalSelected < max
                                                            return (
                                                                <div key={o.id} className="flex items-center justify-between gap-2">
                                                                    <div className="flex-1">
                                                                        <div className="text-sm font-medium">{o.name}</div>
                                                                        {!!Number(o.price_delta || 0) && (
                                                                            <div className="text-xs text-muted-foreground">+{formatCurrency(Number(o.price_delta || 0))}</div>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <Button
                                                                            type="button"
                                                                            variant="outline"
                                                                            size="icon"
                                                                            className="h-7 w-7 rounded-full"
                                                                            disabled={c <= 0}
                                                                            onClick={() => {
                                                                                setConfigCounts(prev => ({
                                                                                    ...prev,
                                                                                    [g.id]: { ...prev[g.id], [o.id]: Math.max(0, (prev[g.id]?.[o.id] || 0) - 1) }
                                                                                }))
                                                                            }}
                                                                        >
                                                                            <Minus className="w-3 h-3" />
                                                                        </Button>
                                                                        <div className="w-6 text-center text-sm">{c}</div>
                                                                        <Button
                                                                            type="button"
                                                                            variant="outline"
                                                                            size="icon"
                                                                            className="h-7 w-7 rounded-full"
                                                                            disabled={!canInc}
                                                                            onClick={() => {
                                                                                setConfigCounts(prev => ({
                                                                                    ...prev,
                                                                                    [g.id]: { ...prev[g.id], [o.id]: (prev[g.id]?.[o.id] || 0) + 1 }
                                                                                }))
                                                                            }}
                                                                        >
                                                                            <Plus className="w-3 h-3" />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            )
                                                        })}
                                                </div>
                                            </div>
                                        )
                                    })}

                                    <div className="flex items-center justify-between text-sm">
                                        <div className="text-muted-foreground">Unit price</div>
                                        <div className="font-medium">{formatCurrency(unit)}</div>
                                    </div>

                                    <DialogFooter>
                                        <Button type="button" variant="secondary" onClick={() => setConfigOpen(false)}>
                                            Cancel
                                        </Button>
                                        <Button
                                            type="button"
                                            disabled={!allSatisfied}
                                            onClick={() => {
                                                addToCart(item, snapshot)
                                                setConfigOpen(false)
                                            }}
                                        >
                                            Add to cart
                                        </Button>
                                    </DialogFooter>
                                </div>
                            )
                        })()}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Payment Dialog */}
            <Dialog open={!!paymentOrder} onOpenChange={(open) => !open && setPaymentOrder(null)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Complete Payment</DialogTitle>
                        <DialogDescription>
                            Table {paymentOrder?.table_number} • Order #{paymentOrder?.order_number || paymentOrder?.id.slice(0, 4)}
                        </DialogDescription>
                    </DialogHeader>

                    {/* ... (rest of content) */}
                    <div className="space-y-4 py-4">
                        {/* Mini Menu Summary */}
                        <div className="bg-muted/30 rounded-lg p-3 space-y-3 max-h-[200px] overflow-y-auto text-sm border">
                            {paymentOrder?.items?.map((item, idx) => (
                                <div key={idx} className="border-b last:border-0 pb-2 last:pb-0">
                                    <div className="font-medium">
                                        {item.quantity}x {item.menu_items?.name}
                                    </div>
                                    {formatModifiersSummary(item.modifiers) && (
                                        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                            {formatModifiersSummary(item.modifiers)}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between items-center font-medium">
                            <span>Subtotal</span>
                            <span>{formatCurrency(paymentOrder?.total_amount || 0)}</span>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="tip-amount">Add Tip (Optional)</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                                <Input
                                    id="tip-amount"
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

                        {terminalStatus && (
                            <div className={cn(
                                "text-center p-3 rounded-lg border font-medium",
                                terminalStatus.includes("Approved") ? "bg-green-500/10 text-green-600 border-green-500/20" :
                                    terminalStatus.includes("Failed") || terminalStatus.includes("Timeout") ? "bg-destructive/10 text-destructive border-destructive/20" :
                                        "animate-pulse bg-primary/5 text-primary border-primary/20"
                            )}>
                                {terminalStatus}
                                {(terminalStatus.includes("Failed") || terminalStatus.includes("Timeout")) && (
                                    <div className="text-[10px] opacity-80 mt-1">Try again or use Manual Pay</div>
                                )}
                            </div>
                        )}
                    </div>

                    <DialogFooter className="flex flex-col sm:flex-row gap-2">
                        <Button variant="ghost" className="sm:mr-auto" onClick={() => setPaymentOrder(null)} disabled={isTerminalLoading}>Cancel</Button>
                        <Button variant="outline" onClick={handleConfirmPayment} disabled={isTerminalLoading}>Manual Pay</Button>
                        <Button onClick={triggerTerminalPayment} disabled={isTerminalLoading} className="gap-2">
                            <CreditCard className="w-4 h-4" /> {isTerminalLoading ? "Processing..." : "Pay with Terminal"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Terminal Selection Dialog */}
            <Dialog open={terminalSelectionOpen} onOpenChange={setTerminalSelectionOpen}>
                <DialogContent className="sm:max-w-xs">
                    <DialogHeader>
                        <DialogTitle>Select Terminal</DialogTitle>
                        <DialogDescription>
                            Choose which terminal to use for this payment.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-2 py-4">
                        {(storeData?.mp_devices || []).map((device: any) => (
                            <Button
                                key={device.id}
                                variant="outline"
                                className="justify-start gap-3 h-12"
                                onClick={() => handleTerminalPayment(device.id)}
                            >
                                <CreditCard className="w-4 h-4 text-muted-foreground" />
                                <div className="text-left">
                                    <div className="font-medium text-sm">{device.name}</div>
                                    <div className="text-[10px] text-muted-foreground">ID: {device.id}</div>
                                </div>
                            </Button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
