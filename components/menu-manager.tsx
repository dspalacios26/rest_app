"use client"

import { useState } from "react"
import { Plus, Edit, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useMenu, MenuItem, ModifierGroup, ModifierOption } from "@/hooks/use-menu"

const newId = () => {
    const cryptoObj = globalThis.crypto as Crypto | undefined
    return cryptoObj?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function MenuManager({ storeId }: { storeId: string }) {
    const { menuItems, upsertItem, deleteItem } = useMenu(storeId, { includeUnavailable: true })
    const [isOpen, setIsOpen] = useState(false)
    const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null)

    // Categories from existing items + default ones
    const categories = Array.from(new Set([...menuItems.map(i => i.category), 'Mains', 'Appetizers', 'Drinks', 'Dessert']))

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

                                                <div className="grid grid-cols-3 gap-3">
                                                    <div>
                                                        <Label className="text-xs">Exact count</Label>
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            value={Number.isFinite(g.max) ? g.max : 0}
                                                            onChange={(e) => {
                                                                const n = Math.max(0, parseInt(e.target.value || '0', 10) || 0)
                                                                updateGroup(g.id, { min: n, max: n })
                                                            }}
                                                            className="mt-1"
                                                        />
                                                    </div>
                                                    <div className="col-span-2 flex items-end gap-2">
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
        </div>
    )
}
