"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { ChefHat, LayoutGrid, LineChart, LogOut, Menu, UtensilsCrossed } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export default function StoreLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Unwrapping params for Next.js 15 (though here it's passed as prop from layout, but in server components it is promise)
    // Since this is client component, we use usePathname or expect params.
    // Actually layout params are not promises in client components if passed down? In Next 15 they are Promises in Server, but let's assume standard behavior or use `useParams` if needed.
    // We'll stick to client-side paradigm for navigation active state.

    const pathname = usePathname()
    const router = useRouter()
    const [mobileNavOpen, setMobileNavOpen] = useState(false)
    // const storeId = params.storeId // might need `useParams` hook if this comes as promise in future
    // Creating a safe access

    const navItems = [
        { name: "Kitchen", href: "kitchen", icon: ChefHat },
        { name: "POS / Orders", href: "pos", icon: LayoutGrid },
        { name: "Analytics", href: "admin", icon: LineChart },
    ]

    return (
        <div className="flex min-h-screen bg-muted/20">
            {/* Sidebar (desktop) */}
            <aside className="hidden md:flex w-64 bg-card border-r flex-col fixed h-full z-10">
                <div className="h-16 flex items-center justify-center md:justify-start md:px-6 border-b">
                    <UtensilsCrossed className="w-8 h-8 text-primary" />
                    <span className="ml-2 font-bold text-lg hidden md:block">RestOS</span>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    {navItems.map((item) => {
                        const isActive = pathname.includes(item.href)
                        return (
                            <Button
                                key={item.href}
                                variant={isActive ? "default" : "ghost"}
                                className={cn(
                                    "w-full justify-start",
                                    !isActive && "text-muted-foreground hover:text-foreground",
                                    isActive && "bg-primary text-primary-foreground"
                                )}
                                asChild
                            >
                                <Link href={`${item.href}`}>
                                    <item.icon className="w-5 h-5 mr-3" />
                                    <span className="hidden md:inline">{item.name}</span>
                                </Link>
                            </Button>
                        )
                    })}
                </nav>

                <div className="p-4 border-t">
                    <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={() => router.push('/')}>
                        <LogOut className="w-5 h-5 mr-3" />
                        <span className="hidden md:inline">Exit Store</span>
                    </Button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 md:ml-64 p-4 md:p-8">
                {/* Mobile top bar */}
                <div className="md:hidden flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <UtensilsCrossed className="w-6 h-6 text-primary" />
                        <span className="font-bold">RestOS</span>
                    </div>

                    <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="icon" aria-label="Open navigation">
                                <Menu className="w-4 h-4" />
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-sm">
                            <DialogHeader>
                                <DialogTitle>Navigation</DialogTitle>
                            </DialogHeader>

                            <div className="space-y-2">
                                {navItems.map((item) => {
                                    const isActive = pathname.includes(item.href)
                                    return (
                                        <Button
                                            key={item.href}
                                            variant={isActive ? "default" : "ghost"}
                                            className={cn(
                                                "w-full justify-start",
                                                !isActive && "text-muted-foreground hover:text-foreground",
                                                isActive && "bg-primary text-primary-foreground"
                                            )}
                                            asChild
                                            onClick={() => setMobileNavOpen(false)}
                                        >
                                            <Link href={`${item.href}`}>
                                                <item.icon className="w-5 h-5 mr-3" />
                                                <span>{item.name}</span>
                                            </Link>
                                        </Button>
                                    )
                                })}

                                <div className="pt-2 border-t">
                                    <Button
                                        variant="ghost"
                                        className="w-full justify-start text-muted-foreground"
                                        onClick={() => {
                                            setMobileNavOpen(false)
                                            router.push('/')
                                        }}
                                    >
                                        <LogOut className="w-5 h-5 mr-3" />
                                        <span>Exit Store</span>
                                    </Button>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
                {children}
            </main>
        </div>
    )
}
