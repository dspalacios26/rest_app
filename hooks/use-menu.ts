"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export type MenuItem = {
    id: string
    name: string
    description?: string
    price: number
    category: string
    available: boolean
    image_url?: string
}

export function useMenu(storeId: string) {
    const [menuItems, setMenuItems] = useState<MenuItem[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!storeId) return
        fetchMenu()
    }, [storeId])

    const fetchMenu = async () => {
        try {
            const { data, error } = await supabase
                .from('menu_items')
                .select('*')
                .eq('store_id', storeId)
                .eq('available', true)
                .order('category', { ascending: true })

            if (error) {
                console.error('Error fetching menu:', error)
            } else {
                setMenuItems(data as any || [])
            }
        } catch (error) {
            console.error('Error in fetchMenu:', error)
        } finally {
            setLoading(false)
        }
    }

    return { menuItems, loading, refresh: fetchMenu }
}
