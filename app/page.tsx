"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Store as StoreIcon, Plus, ArrowRight, Loader2, ChefHat, LayoutGrid, LineChart } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type Store = {
  id: string
  name: string
  created_at: string
}

export default function Home() {
  const router = useRouter()
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [newStoreName, setNewStoreName] = useState("")
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchStores()
  }, [])

  const fetchStores = async () => {
    try {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error
      setStores(data || [])
    } catch (error) {
      console.error("Error fetching stores:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newStoreName.trim()) return

    setCreating(true)
    try {
      const { data, error } = await supabase
        .from("stores")
        .insert([{ name: newStoreName }])
        .select()
        .single()

      if (error) throw error
      if (data) {
        setStores([data, ...stores])
        setNewStoreName("")
      }
    } catch (error) {
      console.error("Error creating store:", error)
    } finally {
      setCreating(false)
    }
  }

  const navigateToStore = (storeId: string, view: 'kitchen' | 'pos' | 'admin') => {
    router.push(`/${storeId}/${view}`)
  }

  return (
    <div className="min-h-screen bg-muted/40 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full grid md:grid-cols-2 gap-8">

        {/* Welcome Section */}
        <div className="flex flex-col justify-center space-y-4">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight text-primary">Restaurant OS</h1>
            <p className="text-xl text-muted-foreground">
              A comprehensive platform for modern dining management.
            </p>
          </div>

          <div className="grid gap-4 py-8">
            <div className="flex items-center gap-4">
              <div className="bg-primary/10 p-3 rounded-full">
                <ChefHat className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Kitchen Display System</h3>
                <p className="text-sm text-muted-foreground">Real-time order management flow.</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="bg-primary/10 p-3 rounded-full">
                <LayoutGrid className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Point of Sale</h3>
                <p className="text-sm text-muted-foreground">Intuitive menu and order taking.</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="bg-primary/10 p-3 rounded-full">
                <LineChart className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Analytics Dashboard</h3>
                <p className="text-sm text-muted-foreground">Detailed sales and growth tracking.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Store Selection Card */}
        <Card className="w-full border-border/60 shadow-xl bg-background/60 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Select Location</CardTitle>
            <CardDescription>Choose a store to manage or register a new one.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Create Store Form */}
            <form onSubmit={handleCreateStore} className="flex gap-2">
              <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="storeName" className="sr-only">New Store Name</Label>
                <Input
                  id="storeName"
                  placeholder="Enter new store name..."
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={creating || !newStoreName.trim()}>
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span className="sr-only">Create</span>
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Available Stores</span></div>
            </div>

            {/* Store List */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
              {loading ? (
                <div className="flex justify-center py-8 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : stores.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                  No stores found. Create one to get started.
                </div>
              ) : (
                stores.map((store) => (
                  <div
                    key={store.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-secondary p-2 rounded-md">
                        <StoreIcon className="w-4 h-4 text-foreground" />
                      </div>
                      <span className="font-medium">{store.name}</span>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => navigateToStore(store.id, 'kitchen')}>
                        Kitchen
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => navigateToStore(store.id, 'pos')}>
                        POS
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => navigateToStore(store.id, 'admin')}>
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

          </CardContent>
          <CardFooter className="text-xs text-muted-foreground justify-center">
            Secured by Supabase • Next.js 15
          </CardFooter>
        </Card>

      </div>
    </div>
  )
}
