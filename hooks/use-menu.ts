"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export type ModifierOption = {
    id: string
    name: string
    price_delta?: number
    available?: boolean
}

export type ModifierGroup = {
    id: string
    name: string
    min: number
    max: number
    allow_duplicates?: boolean
    // Optional advanced behavior stored in JSON.
    // - count: use min/max across the whole item (current behavior)
    // - per_piece: configure selections per piece (e.g., Taco 1..N), where max is commonly used as the piece count
    mode?: 'count' | 'per_piece'
    piece_label?: string
    piece_count?: number
    min_per_piece?: number
    options: ModifierOption[]
}

export type MenuItem = {
    id: string
    name: string
    description?: string
    price: number
    category: string
    available: boolean
    image_url?: string
    modifier_groups?: ModifierGroup[]
}

export function useMenu(storeId: string, opts?: { includeUnavailable?: boolean }) {
    const [menuItems, setMenuItems] = useState<MenuItem[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!storeId) return
        fetchMenu()
    }, [storeId])

    const fetchMenu = async () => {
        try {
            let q = supabase
                .from('menu_items')
                .select('*')
                .eq('store_id', storeId)
                .order('category', { ascending: true })

            if (!opts?.includeUnavailable) {
                q = q.eq('available', true)
            }

            const { data, error } = await q

            if (error) {
                console.error('Error fetching menu:', error)
            } else {
                setMenuItems((data as MenuItem[]) || [])
            }
        } catch (error) {
            console.error('Error in fetchMenu:', error)
        } finally {
            setLoading(false)
        }
    }

    const upsertItem = async (item: Partial<MenuItem>) => {
        try {
            const { data, error } = await supabase
                .from('menu_items')
                .upsert({ ...item, store_id: storeId })
                .select()
                .single()

            if (error) throw error
            fetchMenu() // Refresh list
            return data
        } catch (error) {
            console.error('Error upserting item:', error)
            throw error
        }
    }

    const deleteItem = async (itemId: string) => {
        try {
            // Soft delete: just mark as unavailable
            const { error } = await supabase
                .from('menu_items')
                .update({ available: false })
                .eq('id', itemId)

            if (error) throw error
            fetchMenu() // Refresh list
        } catch (error) {
            console.error('Error deleting item:', error)
            throw error
        }
    }

    return { menuItems, loading, refresh: fetchMenu, upsertItem, deleteItem }
}
