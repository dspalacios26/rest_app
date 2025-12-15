"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export type OrderItemModifierSelection = {
    group_id: string
    group_name: string
    selections: Array<{
        option_id: string
        option_name: string
        price_delta: number
        quantity: number
    }>
}

export type OrderItem = {
    id: string
    menu_item_id: string
    quantity: number
    notes: string
    price_at_time?: number
    modifiers?: OrderItemModifierSelection[]
    status?: 'active' | 'cancelled'
    created_at?: string
    menu_items: {
        name: string
    }
}

export type Order = {
    id: string
    order_number: number
    table_number: string
    status: 'queue' | 'preparing' | 'ready' | 'served' | 'paid' | 'cancelled'
    total_amount?: number
    tip_amount?: number // Added for tips logic
    created_at: string
    items?: OrderItem[]
    items_count?: number
    notes?: string
}

export function useOrders(storeId: string) {
    const [orders, setOrders] = useState<Order[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!storeId) return

        fetchOrders()

        const channel = supabase
            .channel('realtime-orders')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'orders',
                    filter: `store_id=eq.${storeId}`
                },
                (payload) => {
                    // Simplest strategy: refetch on any change to ensure consistency with relations
                    // Optimization: Handle inserts/updates locally
                    console.log('Realtime change received:', payload)
                    fetchOrders()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [storeId])

    const fetchOrders = async () => {
        try {
            // Fetch orders with their items
            const { data, error } = await supabase
                .from('orders')
                .select(`
          *,
          items:order_items (
            id,
            menu_item_id,
            quantity,
                        price_at_time,
            notes,
                        modifiers,
            status,
            created_at,
            menu_items (
              name
            )
          )
        `)
                .eq('store_id', storeId)
                .neq('status', 'paid') // Exclude paid orders from Kitchen view usually
                .neq('status', 'cancelled') // Maybe helpful but user said "served or in a status that is served, it can be moved"
                .order('created_at', { ascending: true })

            if (error) {
                console.error('Error fetching orders:', error)
            } else {
                setOrders((data as Order[]) || [])
            }
        } catch (error) {
            console.error('Error in fetchOrders:', error)
        } finally {
            setLoading(false)
        }
    }

    const updateStatus = async (orderId: string, newStatus: Order['status']) => {
        // Optimistic update
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o))

        const { error } = await supabase
            .from('orders')
            .update({ status: newStatus })
            .eq('id', orderId)

        if (error) {
            console.error('Error updating status:', error)
            fetchOrders() // Revert/Reload
        }
    }

    return { orders, loading, updateStatus, refresh: fetchOrders }
}
