"use client"

import { useParams } from "next/navigation"
import { CheckCircle2, Clock, ChefHat, AlertCircle, Trash2, RotateCcw } from "lucide-react"
import { useOrders, Order } from "@/hooks/use-orders"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export default function KitchenPage() {
    const { storeId } = useParams()
    const { orders, loading, updateStatus, refresh } = useOrders(storeId as string)

    const columns = [
        { id: 'queue', label: 'On Queue', icon: Clock, color: 'text-slate-500', border: 'border-slate-200' },
        { id: 'preparing', label: 'Preparing', icon: ChefHat, color: 'text-orange-500', border: 'border-orange-200' },
        { id: 'ready', label: 'Ready to Serve', icon: CheckCircle2, color: 'text-green-500', border: 'border-green-200' },
    ] as const

    const getOrdersByStatus = (status: string) => orders.filter(o => o.status === status)

    if (loading) {
        return <div className="flex h-full items-center justify-center p-8">Loading orders...</div>
    }

    return (
        <div className="h-full flex flex-col space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight">Kitchen Display</h1>
                <div className="flex gap-2 items-center">
                    <Button variant="outline" size="sm" onClick={() => refresh()}>
                        <RotateCcw className="w-4 h-4 mr-2" /> Refresh
                    </Button>
                    <span className="text-sm text-muted-foreground flex items-center gap-1 ml-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Live
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full overflow-hidden">
                {columns.map((col) => {
                    const colOrders = getOrdersByStatus(col.id)
                    const Icon = col.icon

                    return (
                        <div key={col.id} className="flex flex-col h-full bg-muted/30 rounded-lg p-4 border">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <Icon className={cn("w-5 h-5", col.color)} />
                                    <h2 className="font-semibold text-lg">{col.label}</h2>
                                </div>
                                <span className="bg-background px-2 py-0.5 rounded text-sm font-medium border">
                                    {colOrders.length}
                                </span>
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                                {colOrders.length === 0 && (
                                    <div className="h-24 flex items-center justify-center text-muted-foreground text-sm italic border-2 border-dashed rounded-lg">
                                        No orders
                                    </div>
                                )}
                                {colOrders.map((order) => (
                                    <OrderCard
                                        key={order.id}
                                        order={order}
                                        onStatusUpdate={updateStatus}
                                        colId={col.id}
                                    />
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

const PLATE_MARKER_RE = /^\[PLATE:(\d+)\]\s*/

const stripPlateMarker = (notes: string | null | undefined) => {
    if (!notes) return ""
    return notes.replace(PLATE_MARKER_RE, "")
}

const getPlateNumber = (notes: string | null | undefined) => {
    if (!notes) return 1
    const m = notes.match(PLATE_MARKER_RE)
    if (!m) return 1
    return Math.max(1, parseInt(m[1] || "1", 10) || 1)
}

const groupByPlate = (items: any[]) => {
    const grouped = new Map<number, any[]>()
    for (const item of items) {
        const plate = getPlateNumber(item.notes)
        const list = grouped.get(plate) || []
        list.push(item)
        grouped.set(plate, list)
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => a - b)
}

function OrderCard({ order, onStatusUpdate, colId }: { order: Order, onStatusUpdate: any, colId: string }) {
    const isModified = false; // Logic for detecting modification could be added here based on timestamp vs last_viewed

    return (
        <Card className={cn("shadow-sm relative overflow-hidden transition-all hover:shadow-md",
            colId === 'preparing' ? "border-orange-200 bg-orange-50/5 dark:bg-orange-950/10" :
                colId === 'ready' ? "border-green-200 bg-green-50/5 dark:bg-green-950/10" : ""
        )}>
            {colId === 'queue' && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-400" />
            )}
            {colId === 'preparing' && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500 animate-pulse" />
            )}
            {colId === 'ready' && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500" />
            )}

            <CardHeader className="p-3 pb-2">
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-base">Table {order.table_number}</CardTitle>
                        <CardDescription className="text-xs">
                            #{order.order_number || order.id.slice(0, 4)} • {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </CardDescription>
                    </div>
                    {order.notes && (
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                    )}
                </div>
            </CardHeader>

            <CardContent className="p-3 pt-0 space-y-1">
                {(() => {
                    // Logic to split items
                    const items = order.items || []
                    const isCancelled = (item: any) => item.status === 'cancelled'

                    // "New" items: Not cancelled + created > 2s after order
                    const isNew = (item: any) => {
                        if (item.status === 'cancelled') return false
                        const itemTime = item.created_at ? new Date(item.created_at).getTime() : 0
                        const orderTime = new Date(order.created_at).getTime()
                        return (itemTime - orderTime > 2000)
                    }

                    const newItems = items.filter(isNew)
                    const oldItems = items.filter(i => !isNew(i) && !isCancelled(i))
                    const cancelledItems = items.filter(isCancelled)

                    return (
                        <div className="space-y-3">
                            {/* NEW ITEMS SECTION */}
                            {newItems.length > 0 && (
                                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded border border-yellow-200 dark:border-yellow-800">
                                    <div className="text-xs font-bold text-yellow-600 dark:text-yellow-400 mb-1 uppercase tracking-wider">New Items</div>
                                    <div className="space-y-1">
                                        {groupByPlate(newItems).map(([plate, items]) => (
                                            <div key={plate} className="space-y-1">
                                                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Plate {plate}</div>
                                                {items.map((item, idx) => (
                                                    <div key={idx} className="flex justify-between text-sm font-medium">
                                                        <span>{item.quantity}x {item.menu_items?.name}</span>
                                                        {item.notes && <span className="text-xs text-muted-foreground italic truncate max-w-[80px]">{stripPlateMarker(item.notes)}</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* EXISTING ITEMS SECTION */}
                            {oldItems.length > 0 && (
                                <div className={cn("space-y-1", newItems.length > 0 && "opacity-60")}>
                                    {newItems.length > 0 && <div className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Already Prepared</div>}
                                    {groupByPlate(oldItems).map(([plate, items]) => (
                                        <div key={plate} className="space-y-1">
                                            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Plate {plate}</div>
                                            {items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between text-sm">
                                                    <span>{item.quantity}x {item.menu_items?.name}</span>
                                                    {item.notes && <span className="text-xs text-muted-foreground italic truncate max-w-[80px]">{stripPlateMarker(item.notes)}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* CANCELLED ITEMS SECTION */}
                            {cancelledItems.length > 0 && (
                                <div className="pt-2 border-t border-dashed">
                                    <div className="text-xs font-bold text-red-500/70 mb-1 uppercase tracking-wider">Cancelled</div>
                                    {groupByPlate(cancelledItems).map(([plate, items]) => (
                                        <div key={plate} className="space-y-1">
                                            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Plate {plate}</div>
                                            {items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between text-sm text-muted-foreground line-through opacity-70">
                                                    <span>{item.quantity}x {item.menu_items?.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                })()}

                {order.notes && (
                    <div className="mt-2 text-xs bg-amber-100 dark:bg-amber-900/30 p-1.5 rounded text-amber-800 dark:text-amber-200">
                        Note: {order.notes}
                    </div>
                )}
            </CardContent>

            <CardFooter className="p-3 pt-2 gap-2 flex flex-wrap">
                {colId === 'queue' && (
                    <Button size="sm" className="w-full bg-orange-500 hover:bg-orange-600 text-white h-8" onClick={() => onStatusUpdate(order.id, 'preparing')}>
                        Start Preparing
                    </Button>
                )}
                {colId === 'preparing' && (
                    <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 text-white h-8" onClick={() => onStatusUpdate(order.id, 'ready')}>
                        Mark Ready
                    </Button>
                )}
                {colId === 'ready' && (
                    <Button size="sm" className="flex-1 h-8" variant="outline" onClick={() => onStatusUpdate(order.id, 'served')}>
                        Served
                    </Button>
                )}
                {colId !== 'ready' && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => onStatusUpdate(order.id, 'cancelled')}>
                        <Trash2 className="w-4 h-4" />
                    </Button>
                )}
            </CardFooter>
        </Card>
    )
}
