import { SettingsPanel } from "@/components/dashboard/settings-panel";

export default function SettingsPage() {
    return (
        <div className="space-y-6">
            <div>
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-700 dark:text-sky-300">Preferences</p>
                <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Settings</h1>
                <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-400">Customize alerts, privacy, and appearance with a blue-and-gold interface that adapts to your theme.</p>
            </div>
            <SettingsPanel />
        </div>
    );
}
