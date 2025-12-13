"use client"

import { useParams } from "next/navigation"
import { CheckCircle2, Clock, ChefHat, AlertCircle, Trash2 } from "lucide-react"
import { useOrders, Order } from "@/hooks/use-orders"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export default function KitchenPage() {
    const { storeId } = useParams()
    const { orders, loading, updateStatus } = useOrders(storeId as string)

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
                <div className="flex gap-2">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
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
                {order.items?.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                        <span className="font-medium">{item.quantity}x {item.menu_items?.name || 'Unknown Item'}</span>
                        {item.notes && <span className="text-xs text-muted-foreground italic truncate max-w-[100px]">{item.notes}</span>}
                    </div>
                ))}
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
