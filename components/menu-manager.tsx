"use client"

import { useState } from "react"
import { Plus, Edit, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useMenu, MenuItem } from "@/hooks/use-menu"

export function MenuManager({ storeId }: { storeId: string }) {
    const { menuItems, upsertItem, deleteItem } = useMenu(storeId)
    const [isOpen, setIsOpen] = useState(false)
    const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null)

    // Categories from existing items + default ones
    const categories = Array.from(new Set([...menuItems.map(i => i.category), 'Mains', 'Appetizers', 'Drinks', 'Dessert']))

    const handleOpen = (item?: MenuItem) => {
        setEditingItem(item || { category: 'Mains', available: true })
        setIsOpen(true)
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
