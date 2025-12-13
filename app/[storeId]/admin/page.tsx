"use client"

import { useEffect, useState, useMemo } from "react"
import { useParams } from "next/navigation"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts"
import { Calendar, DollarSign, TrendingUp, CreditCard, Activity, Box } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn, formatCurrency } from "@/lib/utils"

// Inline format helper if not in utils
const formatMoney = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function AdminPage() {
    const { storeId } = useParams()
    const [orders, setOrders] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [investment, setInvestment] = useState<string>("1000")
    const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month' | 'year'>('week')

    // Auth State
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [passwordInput, setPasswordInput] = useState("")
    const [authError, setAuthError] = useState(false)

    useEffect(() => {
        if (!storeId || !isAuthenticated) return
        fetchData()
    }, [storeId, timeRange, isAuthenticated])

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault()
        if (passwordInput === "d0Ncu1o_") {
            setIsAuthenticated(true)
            setAuthError(false)
        } else {
            setAuthError(true)
        }
    }

    const fetchData = async () => {
        setLoading(true)
        try {
            // Fetch orders based on meaningful status (paid preferred, or all served)
            // For analytics, usually 'paid' is best.
            const { data, error } = await supabase
                .from('orders')
                .select(`
          *,
          items:order_items (
            quantity,
            price_at_time,
            menu_items (name)
          )
        `)
                .eq('store_id', storeId)
                .eq('status', 'paid')
                .order('created_at', { ascending: true })

            if (error) console.error(error)
            else setOrders(data || [])
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    // Metrics
    const totalRevenue = useMemo(() => orders.reduce((acc, o) => acc + (o.total_amount || 0), 0), [orders])
    const totalTips = useMemo(() => orders.reduce((acc, o) => acc + (o.tip_amount || 0), 0), [orders])
    const totalOrders = orders.length
    const avgOrderValue = totalOrders > 0 ? (totalRevenue - totalTips) / totalOrders : 0 // Avg based on Food Sales only? Or Total including tips? Usually Total is fine, but cleaner to separate.
    // Let's keep Revenue = Total from DB. 

    const netProfit = totalRevenue - (parseFloat(investment) || 0)

    // Chart Data Preparation
    const salesData = useMemo(() => {
        // Aggregate by Date based on timeRange
        const grouped: Record<string, number> = {}

        orders.forEach(order => {
            const date = new Date(order.created_at)
            let key = ''
            if (timeRange === 'day') key = date.toLocaleTimeString([], { hour: '2-digit' }) // Hourly
            else if (timeRange === 'week' || timeRange === 'month') key = date.toLocaleDateString() // Daily
            else key = date.toLocaleDateString([], { month: 'short' }) // Monthly

            grouped[key] = (grouped[key] || 0) + (order.total_amount || 0)
        })

        return Object.entries(grouped).map(([name, total]) => ({ name, total }))
    }, [orders, timeRange])

    // Top Items
    const topItemsData = useMemo(() => {
        const itemCounts: Record<string, number> = {}
        orders.forEach(order => {
            order.items?.forEach((item: any) => {
                const name = item.menu_items?.name || 'Unknown'
                itemCounts[name] = (itemCounts[name] || 0) + item.quantity
            })
        })

        return Object.entries(itemCounts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5) // Top 5
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
                <h1 className="text-3xl font-bold tracking-tight">Analytics Dashboard</h1>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatMoney(totalRevenue)}</div>
                        <p className="text-xs text-muted-foreground">Sales + Tips</p>
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
                </div>
            </div>
        </div>
    )
}
