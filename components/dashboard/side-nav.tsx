"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Award, Building2, CalendarDays, LayoutGrid, Settings, Sparkles, Users, Tickets } from "lucide-react";

const items = [
    { label: "Overview", href: "/dashboard", icon: LayoutGrid },
    { label: "Users", href: "/dashboard/users", icon: Users },
    { label: "Events", href: "/dashboard/events", icon: Tickets },
    { label: "Facilities", href: "/dashboard/facilities", icon: Building2 },
    { label: "Calendar", href: "/dashboard/calendar", icon: CalendarDays },
    { label: "Certificates", href: "/dashboard/certificates", icon: Award },
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function SideNav() {
    const pathname = usePathname();

    return (
        <aside className="hidden w-72 flex-col rounded-[28px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.16)] backdrop-blur transition-colors dark:border-slate-800 dark:bg-slate-950/75 dark:shadow-[0_20px_60px_-20px_rgba(0,0,0,0.65)] xl:flex">
            <div className="mb-8 flex items-center gap-3">
                <div className="rounded-2xl bg-sky-100 p-2 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300">
                    <Sparkles size={20} />
                </div>
                <div>
                    <p className="text-sm font-medium uppercase tracking-[0.3em] text-amber-600">QMO</p>
                    <p className="text-xl font-semibold text-slate-900 dark:text-white">Operations hub</p>
                </div>
            </div>

            <nav className="space-y-2">
                {items.map(({ href, icon: Icon, label }) => {
                    const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition ${active ? "bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-300" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"}`}
                        >
                            <span className="flex items-center gap-3">
                                <Icon size={18} />
                                {label}
                            </span>
                        </Link>
                    );
                })}
            </nav>

            <div className="mt-auto rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                <p className="font-semibold">Supabase ready</p>
                <p className="mt-1 text-amber-800/80 dark:text-amber-200/70">Connect your project URL and anon key to enable live auth and data syncing.</p>
            </div>
        </aside>
    );
}
