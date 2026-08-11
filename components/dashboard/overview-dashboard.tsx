"use client";

import { useEffect, useState } from "react";
import { CalendarDays, CircleAlert, LoaderCircle, Sparkles, Tickets, Users } from "lucide-react";
import type { DashboardOverview } from "@/lib/dashboard-overview";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";

const numberFormatter = new Intl.NumberFormat("en");

export function OverviewDashboard() {
    const [overview, setOverview] = useState<DashboardOverview | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        authenticatedFetch<DashboardOverview>("/api/overview")
            .then((response) => {
                if (active) setOverview(response);
            })
            .catch((loadError: unknown) => {
                if (active) {
                    setError(loadError instanceof Error ? loadError.message : "Unable to load overview figures.");
                }
            });

        return () => {
            active = false;
        };
    }, []);

    const stats = [
        { label: "Users", value: overview?.users, icon: Users },
        { label: "Events", value: overview?.events, icon: Tickets },
        { label: "Upcoming", value: overview?.upcoming_events, icon: CalendarDays },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-sm font-medium uppercase tracking-[0.3em] text-sky-700 dark:text-sky-300">Command center</p>
                    <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Welcome back, your workspace is firing on all cylinders.</h1>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300">
                    <Sparkles size={16} /> Live Supabase overview
                </div>
            </div>

            {error ? (
                <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300">
                    <CircleAlert size={16} /> {error}
                </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-3">
                {stats.map(({ label, value, icon: Icon }) => (
                    <div key={label} className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 transition-colors dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
                            <div className="rounded-full bg-sky-100 p-2 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300">
                                <Icon size={16} />
                            </div>
                        </div>
                        <p className="mt-4 text-3xl font-semibold text-slate-900 dark:text-white">
                            {value === undefined ? <LoaderCircle className="animate-spin text-slate-400" size={26} /> : numberFormatter.format(value)}
                        </p>
                    </div>
                ))}
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6 transition-colors dark:border-slate-800 dark:bg-slate-900/70">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Live database figures</h2>
                <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-400">
                    Users and events are exact table counts. Upcoming includes non-cancelled events whose start date is still ahead.
                </p>
            </div>
        </div>
    );
}
