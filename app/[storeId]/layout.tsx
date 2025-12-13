"use client"

import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { ChefHat, LayoutGrid, LineChart, LogOut, UtensilsCrossed } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function StoreLayout({
    children,
    params,
}: {
    children: React.ReactNode
    params: Promise<{ storeId: string }>
}) {
    // Unwrapping params for Next.js 15 (though here it's passed as prop from layout, but in server components it is promise)
    // Since this is client component, we use usePathname or expect params.
    // Actually layout params are not promises in client components if passed down? In Next 15 they are Promises in Server, but let's assume standard behavior or use `useParams` if needed.
    // We'll stick to client-side paradigm for navigation active state.

    const pathname = usePathname()
    const router = useRouter()
    // const storeId = params.storeId // might need `useParams` hook if this comes as promise in future
    // Creating a safe access

    const navItems = [
        { name: "Kitchen", href: "kitchen", icon: ChefHat },
        { name: "POS / Orders", href: "pos", icon: LayoutGrid },
        { name: "Analytics", href: "admin", icon: LineChart },
    ]

    return (
        <div className="flex min-h-screen bg-muted/20">
            {/* Sidebar */}
            <aside className="w-20 md:w-64 bg-card border-r flex flex-col fixed h-full z-10">
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
            <main className="flex-1 ml-20 md:ml-64 p-8">
                {children}
            </main>
        </div>
    )
}
