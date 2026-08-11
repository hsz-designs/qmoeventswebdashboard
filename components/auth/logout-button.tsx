"use client";

import { LogOut, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

export function LogoutButton() {
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const router = useRouter();

    async function logout() {
        setIsLoggingOut(true);
        await supabase.auth.signOut({ scope: "local" });
        router.replace("/");
        router.refresh();
    }

    return (
        <button
            type="button"
            onClick={logout}
            disabled={isLoggingOut}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-rose-500 dark:hover:bg-rose-400/10 dark:hover:text-rose-300"
        >
            {isLoggingOut ? <LoaderCircle size={16} className="animate-spin" /> : <LogOut size={16} />}
            {isLoggingOut ? "Logging out…" : "Logout"}
        </button>
    );
}
