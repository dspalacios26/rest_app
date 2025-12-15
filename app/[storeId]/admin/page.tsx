"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend } from "recharts"
import { DollarSign, TrendingUp, CreditCard, Activity } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import type { OrderItemModifierSelection } from "@/hooks/use-orders"

// Inline format helper if not in utils
const formatMoney = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

type OrderItem = {
    quantity: number
    price_at_time?: number | null
    modifiers?: OrderItemModifierSelection[]
    menu_items?: { name?: string | null } | null
}

type Order = {
    created_at: string
    total_amount?: number | null
    tip_amount?: number | null
    items?: OrderItem[] | null
}

export default function AdminPage() {
    const { storeId } = useParams()
    const [orders, setOrders] = useState<Order[]>([])
    const [previousOrders, setPreviousOrders] = useState<Order[]>([])
    const [loading, setLoading] = useState(true)
    const [investment, setInvestment] = useState<string>("1000")
    const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month' | 'year'>('week')
    const [activeRange, setActiveRange] = useState<{ start: Date; end: Date } | null>(null)

    const getPeriodRange = (range: 'day' | 'week' | 'month' | 'year') => {
        const now = new Date()
        const CUTOFF_HOUR = 12 // Restaurant “day” starts at 12:00 PM local time

        const withCutoff = (d: Date) => {
            const x = new Date(d)
            x.setHours(CUTOFF_HOUR, 0, 0, 0)
            return x
        }

        const start = new Date(now)
        const end = new Date(now)

        if (range === 'day') {
            // Business-day window: today 12:00 PM -> tomorrow 12:00 PM (or yesterday->today if before noon)
            const todayCutoff = withCutoff(now)
            if (now < todayCutoff) {
                start.setDate(start.getDate() - 1)
            }
            start.setHours(CUTOFF_HOUR, 0, 0, 0)

            end.setTime(start.getTime())
            end.setDate(end.getDate() + 1)
            end.setHours(CUTOFF_HOUR, 0, 0, 0)
            return { start, end }
        }

        if (range === 'week') {
            // Week starts on Monday at 12:00 PM (same cutoff rule).
            const day = start.getDay() // 0=Sun..6=Sat
            const daysSinceMonday = (day + 6) % 7
            start.setDate(start.getDate() - daysSinceMonday)
            start.setHours(CUTOFF_HOUR, 0, 0, 0)

            // If it's Monday before the cutoff, we're still in the previous business week.
            if (now < start) {
                start.setDate(start.getDate() - 7)
                start.setHours(CUTOFF_HOUR, 0, 0, 0)
            }

            end.setTime(start.getTime())
            end.setDate(end.getDate() + 7)
            end.setHours(CUTOFF_HOUR, 0, 0, 0)
            return { start, end }
        }

        if (range === 'month') {
            // Month starts on the 1st at 12:00 PM.
            start.setDate(1)
            start.setHours(CUTOFF_HOUR, 0, 0, 0)

            // If it's the 1st before cutoff, we're still in the previous business month.
            if (now < start) {
                start.setMonth(start.getMonth() - 1, 1)
                start.setHours(CUTOFF_HOUR, 0, 0, 0)
            }

            end.setTime(start.getTime())
            end.setMonth(start.getMonth() + 1, 1)
            end.setHours(CUTOFF_HOUR, 0, 0, 0)
            return { start, end }
        }

        // year starts on Jan 1 at 12:00 PM
        start.setMonth(0, 1)
        start.setHours(CUTOFF_HOUR, 0, 0, 0)

        // If it's Jan 1 before cutoff, we're still in the previous business year.
        if (now < start) {
            start.setFullYear(start.getFullYear() - 1, 0, 1)
            start.setHours(CUTOFF_HOUR, 0, 0, 0)
        }

        end.setTime(start.getTime())
        end.setFullYear(start.getFullYear() + 1, 0, 1)
        end.setHours(CUTOFF_HOUR, 0, 0, 0)
        return { start, end }
    }

    const formatBusinessWindow = (start: Date, endExclusive: Date) => {
        // We query with [start, end), but display an inclusive end for humans.
        const endInclusive = new Date(endExclusive.getTime() - 1)
        const dateTime = (d: Date) => d.toLocaleString([], { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        return `${dateTime(start)} – ${dateTime(endInclusive)}`
    }

    const shiftPeriod = (d: Date, range: 'day' | 'week' | 'month' | 'year', delta: number) => {
        const x = new Date(d)
        if (range === 'day') x.setDate(x.getDate() + delta)
        else if (range === 'week') x.setDate(x.getDate() + 7 * delta)
        else if (range === 'month') x.setMonth(x.getMonth() + delta)
        else x.setFullYear(x.getFullYear() + delta)
        return x
    }

    const formatDelta = (current: number, previous: number, opts?: { money?: boolean }) => {
        const diff = current - previous
        const sign = diff > 0 ? '+' : diff < 0 ? '−' : ''
        const abs = Math.abs(diff)
        const base = opts?.money ? formatMoney(abs) : abs.toLocaleString()
        if (previous === 0) return diff === 0 ? '0' : `${sign}${base}`
        const pct = Math.abs(diff / previous) * 100
        return `${sign}${base} (${pct.toFixed(0)}%)`
    }
    
    const formatPercent = (ratio: number) => `${(ratio * 100).toFixed(1)}%`
    
    const formatRateDelta = (currentRate: number, previousRate: number) => {
        const diff = currentRate - previousRate
        const sign = diff > 0 ? '+' : diff < 0 ? '−' : ''
        const abs = Math.abs(diff)
        const pp = `${sign}${(abs * 100).toFixed(1)} pp`
        if (previousRate === 0) return diff === 0 ? '0 pp' : pp
        const pct = Math.abs(diff / previousRate) * 100
        return `${pp} (${pct.toFixed(0)}%)`
    }

    const fetchOrdersForRange = useCallback(
        async (start: Date, end: Date) => {
            const { data, error } = await supabase
                .from('orders')
                .select(`
          *,
          items:order_items (
            quantity,
            price_at_time,
                        modifiers,
            menu_items (name)
          )
        `)
                .eq('store_id', storeId)
                .eq('status', 'paid')
                .gte('created_at', start.toISOString())
                .lt('created_at', end.toISOString())
                .order('created_at', { ascending: true })

            if (error) throw error
            return (data || []) as Order[]
        },
        [storeId]
    )

    // Auth State
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [passwordInput, setPasswordInput] = useState("")
    const [authError, setAuthError] = useState(false)

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault()
        if (passwordInput === "d0Ncu1o_") {
            setIsAuthenticated(true)
            setAuthError(false)
        } else {
            setAuthError(true)
        }
    }

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
                        const { start, end } = getPeriodRange(timeRange)
            setActiveRange({ start, end })

            const prevStart = shiftPeriod(start, timeRange, -1)
            const prevEnd = shiftPeriod(end, timeRange, -1)

            const [current, previous] = await Promise.all([
                fetchOrdersForRange(start, end),
                fetchOrdersForRange(prevStart, prevEnd),
            ])

            setOrders(current)
            setPreviousOrders(previous)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }, [timeRange, fetchOrdersForRange])

    useEffect(() => {
        if (!storeId || !isAuthenticated) return
        fetchData()
    }, [storeId, isAuthenticated, fetchData])

    useEffect(() => {
        if (!storeId || !isAuthenticated) return

        const range = activeRange ?? getPeriodRange(timeRange)
        const msUntilEnd = range.end.getTime() - Date.now()
        const timeout = window.setTimeout(() => {
            fetchData()
        }, Math.max(0, msUntilEnd) + 1000)

        return () => window.clearTimeout(timeout)
    }, [storeId, isAuthenticated, timeRange, fetchData, activeRange])

    // Metrics
    const totalRevenue = useMemo(() => orders.reduce((acc, o) => acc + (o.total_amount || 0), 0), [orders])
    const totalTips = useMemo(() => orders.reduce((acc, o) => acc + (o.tip_amount || 0), 0), [orders])
    const totalOrders = orders.length
    const avgOrderValue = totalOrders > 0 ? (totalRevenue - totalTips) / totalOrders : 0 // Avg based on Food Sales only? Or Total including tips? Usually Total is fine, but cleaner to separate.
    // Let's keep Revenue = Total from DB. 

    const netProfit = totalRevenue - (parseFloat(investment) || 0)

    const prevTotalRevenue = useMemo(() => previousOrders.reduce((acc, o) => acc + (o.total_amount || 0), 0), [previousOrders])
    const prevTotalTips = useMemo(() => previousOrders.reduce((acc, o) => acc + (o.tip_amount || 0), 0), [previousOrders])
    const prevTotalOrders = previousOrders.length
    const prevAvgOrderValue = prevTotalOrders > 0 ? (prevTotalRevenue - prevTotalTips) / prevTotalOrders : 0
    
    const tipsRate = useMemo(() => {
        const salesExcludingTips = totalRevenue - totalTips
        if (salesExcludingTips <= 0) return 0
        return totalTips / salesExcludingTips
    }, [totalRevenue, totalTips])
    
    const prevTipsRate = useMemo(() => {
        const salesExcludingTips = prevTotalRevenue - prevTotalTips
        if (salesExcludingTips <= 0) return 0
        return prevTotalTips / salesExcludingTips
    }, [prevTotalRevenue, prevTotalTips])

    // Chart Data Preparation
    const salesData = useMemo(() => {
        // Aggregate by Date based on timeRange
        const grouped: Record<string, number> = {}

        orders.forEach(order => {
            const date = new Date(order.created_at)
            let key = ''
            if (timeRange === 'day') key = date.toLocaleTimeString([], { hour: '2-digit', hour12: true }) // Hourly
            else if (timeRange === 'week' || timeRange === 'month') key = date.toLocaleDateString([], { month: 'short', day: '2-digit' }) // Daily
            else key = date.toLocaleDateString([], { month: 'short' }) // Monthly

            grouped[key] = (grouped[key] || 0) + (order.total_amount || 0)
        })

        return Object.entries(grouped).map(([name, total]) => ({ name, total }))
    }, [orders, timeRange])

    const peakHours = useMemo(() => {
        if (timeRange !== 'day') return [] as Array<{ hour: string; revenue: number; orders: number }>
        const grouped: Record<string, { revenue: number; orders: number }> = {}
        for (const order of orders) {
            const d = new Date(order.created_at)
            const hour = d.toLocaleTimeString([], { hour: '2-digit', hour12: true })
            grouped[hour] = grouped[hour] || { revenue: 0, orders: 0 }
            grouped[hour].revenue += order.total_amount || 0
            grouped[hour].orders += 1
        }
        return Object.entries(grouped)
            .map(([hour, v]) => ({ hour, revenue: v.revenue, orders: v.orders }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 3)
    }, [orders, timeRange])
    
    const dayparts = useMemo(() => {
        if (timeRange !== 'day') return [] as Array<{ label: string; revenue: number; orders: number }>
        
        const parts = [
            { label: '12 PM – 6 PM', startHour: 12, endHour: 18 },
            { label: '6 PM – 12 AM', startHour: 18, endHour: 24 },
            { label: '12 AM – 6 AM', startHour: 0, endHour: 6 },
            { label: '6 AM – 12 PM', startHour: 6, endHour: 12 },
        ]
        
        const totals = parts.map((p) => ({ label: p.label, revenue: 0, orders: 0 }))
        
        for (const order of orders) {
            const d = new Date(order.created_at)
            const h = d.getHours()
            const idx = parts.findIndex((p) => h >= p.startHour && h < p.endHour)
            const i = idx === -1 ? 0 : idx
            totals[i].revenue += order.total_amount || 0
            totals[i].orders += 1
        }
        
        return totals
    }, [orders, timeRange])

    // Top Items
    const topItemsData = useMemo(() => {
        const itemCounts: Record<string, number> = {}
        orders.forEach(order => {
            order.items?.forEach((item) => {
                const name = item.menu_items?.name || 'Unknown'
                itemCounts[name] = (itemCounts[name] || 0) + item.quantity
            })
        })

        return Object.entries(itemCounts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5) // Top 5
    }, [orders])

    const topModifiersData = useMemo(() => {
        // Aggregate option usage across all paid orders.
        // Multiply by order_item.quantity because modifiers are per unit.
        const counts: Record<string, number> = {}
        for (const order of orders) {
            for (const item of order.items || []) {
                const unitQty = item.quantity || 0
                const groups = item.modifiers || []
                for (const g of groups) {
                    for (const s of (g?.selections || [])) {
                        const name = s?.option_name
                        if (!name) continue
                        const c = (s?.quantity || 0) * unitQty
                        if (c <= 0) continue
                        counts[name] = (counts[name] || 0) + c
                    }
                }
            }
        }
        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8)
    }, [orders])

    if (!isAuthenticated) {
        return (
            <div className="flex h-[calc(100vh-6rem)] items-center justify-center">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle>Admin Access Required</CardTitle>
                        <CardDescription>Enter password to view analytics.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="password">Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={passwordInput}
                                    onChange={(e) => setPasswordInput(e.target.value)}
                                    placeholder="Enter access code"
                                />
                                {authError && <p className="text-sm text-destructive font-medium">Incorrect password.</p>}
                            </div>
                            <Button type="submit" className="w-full">Access Dashboard</Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight">Analytics Dashboard</h1>
                    <div className="text-sm text-muted-foreground">
                        Business window: {formatBusinessWindow(
                            (activeRange ?? getPeriodRange(timeRange)).start,
                            (activeRange ?? getPeriodRange(timeRange)).end
                        )} (local time){loading ? ' • Refreshing…' : ''}
                    </div>
                </div>
                <div className="flex items-center gap-2 bg-card p-1 rounded-md border text-sm">
                    <Button
                        variant={timeRange === 'day' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setTimeRange('day')}
                    >Today</Button>
                    <Button
                        variant={timeRange === 'week' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setTimeRange('week')}
                    >Week</Button>
                    <Button
                        variant={timeRange === 'month' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setTimeRange('month')}
                    >Month</Button>
                    <Button
                        variant={timeRange === 'year' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setTimeRange('year')}
                    >Year</Button>
                </div>
            </div>

            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatMoney(totalRevenue)}</div>
                        <p className="text-xs text-muted-foreground">Sales + Tips</p>
                        <p className="text-xs text-muted-foreground">vs prev: {formatDelta(totalRevenue, prevTotalRevenue, { money: true })}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Tips</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{formatMoney(totalTips)}</div>
                        <p className="text-xs text-muted-foreground">Staff Gratuity</p>
                        <p className="text-xs text-muted-foreground">vs prev: {formatDelta(totalTips, prevTotalTips, { money: true })}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Orders</CardTitle>
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalOrders}</div>
                        <p className="text-xs text-muted-foreground">Paid orders</p>
                        <p className="text-xs text-muted-foreground">vs prev: {formatDelta(totalOrders, prevTotalOrders)}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg. Order Value</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatMoney(avgOrderValue)}</div>
                        <p className="text-xs text-muted-foreground">Excluding tips</p>
                        <p className="text-xs text-muted-foreground">vs prev: {formatDelta(avgOrderValue, prevAvgOrderValue, { money: true })}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Net Profit Est.</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className={cn("text-2xl font-bold", netProfit >= 0 ? "text-green-600" : "text-red-600")}>
                            {formatMoney(netProfit)}
                        </div>
                        <p className="text-xs text-muted-foreground">ROI Calc</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Tips Rate</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatPercent(tipsRate)}</div>
                        <p className="text-xs text-muted-foreground">Tips ÷ Sales (excl. tips)</p>
                        <p className="text-xs text-muted-foreground">vs prev: {formatRateDelta(tipsRate, prevTipsRate)}</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
                {/* Sales Chart */}
                <Card className="col-span-1 lg:col-span-4">
                    <CardHeader>
                        <CardTitle>Sales Overview</CardTitle>
                        <CardDescription>
                            Gross sold over selected period.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={salesData}>
                                    <XAxis
                                        dataKey="name"
                                        stroke="#888888"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        stroke="#888888"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value) => `$${value}`}
                                    />
                                    <Tooltip
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                    />
                                    <Bar dataKey="total" fill="currentColor" radius={[4, 4, 0, 0]} className="fill-primary" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Calculator & Top Items */}
                <div className="col-span-1 lg:col-span-3 space-y-4">
                    {/* Calculator */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Profit Calculator</CardTitle>
                            <CardDescription>Input fixed costs or investment</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>Initial Investment / Costs</Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                                    <Input
                                        value={investment}
                                        onChange={(e) => setInvestment(e.target.value)}
                                        className="pl-7"
                                        type="number"
                                    />
                                </div>
                            </div>
                            <div className="pt-4 border-t flex justify-between items-center text-sm">
                                <span>Total Revenue:</span>
                                <span className="font-medium">{formatMoney(totalRevenue)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span>Net Profit:</span>
                                <span className={cn("font-bold text-lg", netProfit >= 0 ? "text-green-600" : "text-red-600")}>
                                    {formatMoney(netProfit)}
                                </span>
                            </div>
                        </CardContent>
                    </Card>

                    {timeRange === 'day' && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Peak Hours</CardTitle>
                                <CardDescription>Top 3 hours by revenue (business day)</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                                {peakHours.length === 0 ? (
                                    <div className="text-muted-foreground">No orders in this window.</div>
                                ) : (
                                    peakHours.map((h) => (
                                        <div key={h.hour} className="flex items-center justify-between">
                                            <div className="font-medium">{h.hour}</div>
                                            <div className="text-right">
                                                <div>{formatMoney(h.revenue)}</div>
                                                <div className="text-xs text-muted-foreground">{h.orders} orders</div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    )}
                    
                    {timeRange === 'day' && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Dayparts</CardTitle>
                                <CardDescription>Revenue + orders by block (business day)</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                                {dayparts.every((p) => p.orders === 0) ? (
                                    <div className="text-muted-foreground">No orders in this window.</div>
                                ) : (
                                    dayparts.map((p) => (
                                        <div key={p.label} className="flex items-center justify-between">
                                            <div className="font-medium">{p.label}</div>
                                            <div className="text-right">
                                                <div>{formatMoney(p.revenue)}</div>
                                                <div className="text-xs text-muted-foreground">{p.orders} orders</div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Top Selling Items Pie Chart */}
                    <Card className="flex-1">
                        <CardHeader>
                            <CardTitle>Top Selling Items</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[200px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={topItemsData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {topItemsData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend verticalAlign="bottom" height={36} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Top Modifiers */}
                    {topModifiersData.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Top Modifiers</CardTitle>
                                <CardDescription>Most selected options (e.g., meats)</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                                {topModifiersData.map((m) => (
                                    <div key={m.name} className="flex items-center justify-between">
                                        <div className="font-medium">{m.name}</div>
                                        <div className="text-muted-foreground">{m.value}</div>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    )
}
