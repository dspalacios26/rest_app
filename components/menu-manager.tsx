"use client"

import { useState, useEffect } from "react"
import { Plus, Edit, Trash2, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useMenu, MenuItem, ModifierGroup, ModifierOption } from "@/hooks/use-menu"
import { supabase } from "@/lib/supabase"

const newId = () => {
    const cryptoObj = globalThis.crypto as Crypto | undefined
    return cryptoObj?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

type MPDevice = { id: string; name: string }

export function MenuManager({ storeId }: { storeId: string }) {
    const { menuItems, upsertItem, deleteItem } = useMenu(storeId)
    const [isOpen, setIsOpen] = useState(false)
    const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null)
    const [storeSettings, setStoreSettings] = useState<{ mp_device_id?: string; mp_devices?: MPDevice[] } | null>(null)

    // Categories from existing items + default ones
    const categories = Array.from(new Set([...menuItems.map(i => i.category), 'Mains', 'Appetizers', 'Drinks', 'Dessert']))

    // Fetch store settings
    useEffect(() => {
        const fetchStore = async () => {
            const { data } = await supabase.from('stores').select('*').eq('id', storeId).single()
            if (data) {
                // Ensure mp_devices is an array
                const devices = Array.isArray(data.mp_devices) ? data.mp_devices : []
                setStoreSettings({ ...data, mp_devices: devices })
            }
        }
        fetchStore()
    }, [storeId])

    const updateStoreSettings = async () => {
        const { error } = await supabase.from('stores').update({
            mp_device_id: storeSettings?.mp_device_id,
            mp_devices: storeSettings?.mp_devices || []
        }).eq('id', storeId)

        if (error) {
            alert("Failed to update store settings")
        } else {
            alert("Settings updated")
        }
    }

    const addDevice = () => {
        setStoreSettings(prev => ({
            ...prev,
            mp_devices: [...(prev?.mp_devices || []), { id: '', name: 'New Terminal' }]
        }))
    }

    const removeDevice = (idx: number) => {
        setStoreSettings(prev => ({
            ...prev,
            mp_devices: (prev?.mp_devices || []).filter((_, i) => i !== idx)
        }))
    }

    const updateDevice = (idx: number, patch: Partial<MPDevice>) => {
        setStoreSettings(prev => ({
            ...prev,
            mp_devices: (prev?.mp_devices || []).map((d, i) => i === idx ? { ...d, ...patch } : d)
        }))
    }

    const handleOpen = (item?: MenuItem) => {
        setEditingItem(item || { category: 'Mains', available: true, modifier_groups: [] })
        setIsOpen(true)
    }

    const ensureGroups = (x: Partial<MenuItem> | null | undefined) => (x?.modifier_groups || []) as ModifierGroup[]

    const addGroup = () => {
        setEditingItem(prev => {
            const groups = ensureGroups(prev)
            const next: ModifierGroup = {
                id: newId(),
                name: 'Choose options',
                min: 1,
                max: 1,
                allow_duplicates: true,
                options: [],
            }
            return { ...(prev || {}), modifier_groups: [...groups, next] }
        })
    }

    const removeGroup = (groupId: string) => {
        setEditingItem(prev => ({
            ...(prev || {}),
            modifier_groups: ensureGroups(prev).filter(g => g.id !== groupId)
        }))
    }

    const updateGroup = (groupId: string, patch: Partial<ModifierGroup>) => {
        setEditingItem(prev => ({
            ...(prev || {}),
            modifier_groups: ensureGroups(prev).map(g => g.id === groupId ? { ...g, ...patch } : g)
        }))
    }

    const addOption = (groupId: string) => {
        setEditingItem(prev => ({
            ...(prev || {}),
            modifier_groups: ensureGroups(prev).map(g => {
                if (g.id !== groupId) return g
                const next: ModifierOption = { id: newId(), name: 'Option', price_delta: 0, available: true }
                return { ...g, options: [...(g.options || []), next] }
            })
        }))
    }

    const removeOption = (groupId: string, optionId: string) => {
        setEditingItem(prev => ({
            ...(prev || {}),
            modifier_groups: ensureGroups(prev).map(g => {
                if (g.id !== groupId) return g
                return { ...g, options: (g.options || []).filter(o => o.id !== optionId) }
            })
        }))
    }

    const updateOption = (groupId: string, optionId: string, patch: Partial<ModifierOption>) => {
        setEditingItem(prev => ({
            ...(prev || {}),
            modifier_groups: ensureGroups(prev).map(g => {
                if (g.id !== groupId) return g
                return {
                    ...g,
                    options: (g.options || []).map(o => o.id === optionId ? { ...o, ...patch } : o)
                }
            })
        }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingItem) return

        await upsertItem(editingItem)
        setIsOpen(false)
        setEditingItem(null)
    }

    const handleDelete = async (id: string) => {
        if (confirm('Are you sure you want to delete this item?')) {
            await deleteItem(id)
        }
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Menu Management</h2>
                <Button onClick={() => handleOpen()} size="sm" className="gap-2">
                    <Plus className="w-4 h-4" /> Add Item
                </Button>
            </div>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <form onSubmit={handleSubmit}>
                        <DialogHeader>
                            <DialogTitle>{editingItem?.id ? 'Edit Item' : 'Add New Item'}</DialogTitle>
                            <DialogDescription>
                                Make changes to your menu item here. Click save when done.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="name" className="text-right">
                                    Name
                                </Label>
                                <Input
                                    id="name"
                                    value={editingItem?.name || ''}
                                    onChange={e => setEditingItem(prev => ({ ...prev, name: e.target.value }))}
                                    className="col-span-3"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="price" className="text-right">
                                    Price
                                </Label>
                                <Input
                                    id="price"
                                    type="number"
                                    step="0.01"
                                    value={editingItem?.price || ''}
                                    onChange={e => setEditingItem(prev => ({ ...prev, price: parseFloat(e.target.value) }))}
                                    className="col-span-3"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="category" className="text-right">
                                    Category
                                </Label>
                                {/* Simplified Select for now, ideally ComboBox for open creation */}
                                <div className="col-span-3">
                                    <Input
                                        placeholder="Category name..."
                                        value={editingItem?.category || ''}
                                        onChange={e => setEditingItem(prev => ({ ...prev, category: e.target.value }))}
                                        list="category-suggestions"
                                        required
                                    />
                                    <datalist id="category-suggestions">
                                        {categories.map(c => <option key={c} value={c} />)}
                                    </datalist>
                                </div>
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="desc" className="text-right">Description</Label>
                                <Textarea
                                    id="desc"
                                    value={editingItem?.description || ''}
                                    onChange={e => setEditingItem(prev => ({ ...prev, description: e.target.value }))}
                                    className="col-span-3"
                                />
                            </div>

                            <div className="border-t pt-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="font-medium">Customizable options</div>
                                        <div className="text-xs text-muted-foreground">Define required option groups (e.g., “Choose meats”, exactly 4).</div>
                                    </div>
                                    <Button type="button" size="sm" variant="outline" onClick={addGroup} className="gap-2">
                                        <Plus className="w-4 h-4" /> Add group
                                    </Button>
                                </div>

                                <div className="mt-3 space-y-4">
                                    {(editingItem?.modifier_groups || []).length === 0 ? (
                                        <div className="text-xs text-muted-foreground italic">No groups. This item will be added to the cart normally.</div>
                                    ) : (
                                        (editingItem?.modifier_groups || []).map((g) => (
                                            <div key={g.id} className="rounded-md border p-3 space-y-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex-1">
                                                        <Label className="text-xs">Group name</Label>
                                                        <Input
                                                            value={g.name || ''}
                                                            onChange={(e) => updateGroup(g.id, { name: e.target.value })}
                                                            className="mt-1"
                                                        />
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-destructive"
                                                        onClick={() => removeGroup(g.id)}
                                                        title="Remove group"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>

                                                <div className="space-y-3">
                                                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                                        <input
                                                            type="checkbox"
                                                            checked={(g.mode || 'count') === 'per_piece'}
                                                            onChange={(e) => {
                                                                const checked = e.target.checked
                                                                if (checked) {
                                                                    updateGroup(g.id, {
                                                                        mode: 'per_piece',
                                                                        piece_label: g.piece_label || 'Taco',
                                                                        piece_count: g.piece_count || (Number.isFinite(g.max) ? g.max : 4),
                                                                        min_per_piece: g.min_per_piece ?? 1,
                                                                    })
                                                                } else {
                                                                    updateGroup(g.id, { mode: 'count' })
                                                                }
                                                            }}
                                                        />
                                                        Configure per piece (e.g., Taco 1..N)
                                                    </label>

                                                    {(g.mode || 'count') === 'per_piece' ? (
                                                        <div className="grid grid-cols-3 gap-3">
                                                            <div>
                                                                <Label className="text-xs">Piece label</Label>
                                                                <Input
                                                                    value={g.piece_label || 'Taco'}
                                                                    onChange={(e) => updateGroup(g.id, { piece_label: e.target.value })}
                                                                    className="mt-1"
                                                                />
                                                            </div>
                                                            <div>
                                                                <Label className="text-xs">Piece count</Label>
                                                                <Input
                                                                    type="number"
                                                                    min={1}
                                                                    value={g.piece_count ?? (Number.isFinite(g.max) ? g.max : 1)}
                                                                    onChange={(e) => {
                                                                        const n = Math.max(1, parseInt(e.target.value || '1', 10) || 1)
                                                                        updateGroup(g.id, { piece_count: n })
                                                                    }}
                                                                    className="mt-1"
                                                                />
                                                            </div>
                                                            <div>
                                                                <Label className="text-xs">Min per piece</Label>
                                                                <Input
                                                                    type="number"
                                                                    min={0}
                                                                    value={g.min_per_piece ?? 1}
                                                                    onChange={(e) => {
                                                                        const n = Math.max(0, parseInt(e.target.value || '0', 10) || 0)
                                                                        updateGroup(g.id, { min_per_piece: n })
                                                                    }}
                                                                    className="mt-1"
                                                                />
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-3 gap-3">
                                                            <div>
                                                                <Label className="text-xs">Min</Label>
                                                                <Input
                                                                    type="number"
                                                                    min={0}
                                                                    value={Number.isFinite(g.min) ? g.min : 0}
                                                                    onChange={(e) => {
                                                                        const nextMin = Math.max(0, parseInt(e.target.value || '0', 10) || 0)
                                                                        const nextMax = Math.max(nextMin, Number.isFinite(g.max) ? g.max : nextMin)
                                                                        updateGroup(g.id, { min: nextMin, max: nextMax })
                                                                    }}
                                                                    className="mt-1"
                                                                />
                                                            </div>
                                                            <div>
                                                                <Label className="text-xs">Max</Label>
                                                                <Input
                                                                    type="number"
                                                                    min={0}
                                                                    value={Number.isFinite(g.max) ? g.max : (Number.isFinite(g.min) ? g.min : 0)}
                                                                    onChange={(e) => {
                                                                        const currentMin = Number.isFinite(g.min) ? g.min : 0
                                                                        const nextMax = Math.max(currentMin, Math.max(0, parseInt(e.target.value || '0', 10) || 0))
                                                                        updateGroup(g.id, { min: currentMin, max: nextMax })
                                                                    }}
                                                                    className="mt-1"
                                                                />
                                                            </div>
                                                            <div className="flex items-end gap-2">
                                                                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={g.allow_duplicates ?? true}
                                                                        onChange={(e) => updateGroup(g.id, { allow_duplicates: e.target.checked })}
                                                                    />
                                                                    Allow duplicates
                                                                </label>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <div className="text-sm font-medium">Options</div>
                                                        <Button type="button" size="sm" variant="outline" onClick={() => addOption(g.id)} className="gap-2">
                                                            <Plus className="w-4 h-4" /> Add option
                                                        </Button>
                                                    </div>

                                                    {(g.options || []).length === 0 ? (
                                                        <div className="text-xs text-muted-foreground italic">No options yet.</div>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            {(g.options || []).map((o) => (
                                                                <div key={o.id} className="grid grid-cols-12 gap-2 items-center">
                                                                    <div className="col-span-6">
                                                                        <Input
                                                                            value={o.name || ''}
                                                                            onChange={(e) => updateOption(g.id, o.id, { name: e.target.value })}
                                                                            placeholder="Option name"
                                                                        />
                                                                    </div>
                                                                    <div className="col-span-3">
                                                                        <Input
                                                                            type="number"
                                                                            step="0.01"
                                                                            value={o.price_delta ?? 0}
                                                                            onChange={(e) => updateOption(g.id, o.id, { price_delta: parseFloat(e.target.value) || 0 })}
                                                                            placeholder="+$"
                                                                        />
                                                                    </div>
                                                                    <div className="col-span-2 flex items-center justify-center">
                                                                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={o.available ?? true}
                                                                                onChange={(e) => updateOption(g.id, o.id, { available: e.target.checked })}
                                                                            />
                                                                            Avail.
                                                                        </label>
                                                                    </div>
                                                                    <div className="col-span-1 flex justify-end">
                                                                        <Button
                                                                            type="button"
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-8 w-8 text-destructive"
                                                                            onClick={() => removeOption(g.id, o.id)}
                                                                            title="Remove option"
                                                                        >
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                        <DialogFooter className="flex justify-between items-center sm:justify-between">
                            <Button type="button" variant="secondary" onClick={() => setIsOpen(false)}>
                                Close
                            </Button>
                            <Button type="submit">Save changes</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Management List View */}
            <div className="space-y-2 mt-4 max-h-[300px] overflow-y-auto border rounded-md p-2 custom-scrollbar">
                {menuItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md border-b last:border-0">
                        <div>
                            <div className="font-medium">{item.name}</div>
                            <div className="text-xs text-muted-foreground">{item.category} • ${item.price}</div>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleOpen(item)} className="h-8 w-8">
                                <Edit className="w-4 h-4 text-blue-500" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)} className="h-8 w-8">
                                <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Store Settings / Device ID */}
            <div className="mt-8 pt-6 border-t">
                <div className="flex items-center gap-2 mb-4">
                    <Settings className="w-5 h-5 text-muted-foreground" />
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Store Settings</h3>
                </div>
                <div className="space-y-4 bg-muted/30 p-4 rounded-lg border">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label className="font-semibold">Mercado Pago Terminals</Label>
                            <Button variant="outline" size="sm" onClick={addDevice} type="button" className="gap-2">
                                <Plus className="w-4 h-4" /> Add Terminal
                            </Button>
                        </div>

                        {(storeSettings?.mp_devices || []).length === 0 && (
                            <p className="text-xs text-muted-foreground italic">No terminals added. Add one to enable physical payments.</p>
                        )}

                        <div className="space-y-3">
                            {(storeSettings?.mp_devices || []).map((device, idx) => (
                                <div key={idx} className="flex gap-2 items-end border p-3 rounded-md bg-background">
                                    <div className="flex-1 space-y-1">
                                        <Label className="text-[10px] uppercase">Name (e.g. Counter 1)</Label>
                                        <Input
                                            value={device.name}
                                            onChange={e => updateDevice(idx, { name: e.target.value })}
                                            placeholder="Terminal Name"
                                        />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <Label className="text-[10px] uppercase">Device ID</Label>
                                        <Input
                                            value={device.id}
                                            onChange={e => updateDevice(idx, { id: e.target.value })}
                                            placeholder="ID"
                                        />
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={() => removeDevice(idx)} type="button" className="text-destructive h-10 w-10">
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>

                        <div className="pt-2 border-t">
                            <Button className="w-full" onClick={updateStoreSettings} type="button">Save All Settings</Button>
                        </div>

                        <p className="text-[10px] text-muted-foreground">
                            Required to trigger physical payments automatically. Find Device IDs in your Mercado Pago account.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
