import { SideNav } from "@/components/dashboard/side-nav";
import { LogoutButton } from "@/components/auth/logout-button";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_28%),linear-gradient(135deg,_#f8fbff,_#eef6ff)] px-4 py-4 text-slate-700 transition-colors dark:bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.14),_transparent_28%),linear-gradient(135deg,_#020617,_#0f172a)] dark:text-slate-300 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-7xl gap-6">
                <SideNav />
                <main className="flex-1 rounded-[28px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.16)] backdrop-blur transition-colors dark:border-slate-800 dark:bg-slate-950/75 dark:shadow-[0_20px_60px_-20px_rgba(0,0,0,0.65)] sm:p-8">
                    <div className="mb-5 flex justify-end">
                        <LogoutButton />
                    </div>
                    {children}
                </main>
            </div>
        </div>
    );
}
