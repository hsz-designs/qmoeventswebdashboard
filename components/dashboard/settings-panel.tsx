"use client";

import { useState } from "react";
import { Bell, Lock, MoonStar, Palette, ShieldCheck } from "lucide-react";

const options = [
    { title: "Email notifications", description: "Receive updates about new events and team activity." },
    { title: "Compact mode", description: "Reduce spacing for a denser dashboard layout." },
    { title: "Two-factor auth", description: "Add an extra layer of protection to your account." },
];

export function SettingsPanel() {
    const [enabled, setEnabled] = useState([true, false, true]);

    return (
        <div className="space-y-6">
            <div className="rounded-[28px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.18)] backdrop-blur transition-colors dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-[0_20px_60px_-20px_rgba(0,0,0,0.65)]">
                <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-amber-100 p-2 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                        <Palette size={18} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-700 dark:text-sky-300">Brand theme</p>
                        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Blue and gold experience</h2>
                    </div>
                </div>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">The workspace uses a premium adaptive palette with calm blue tones and gold highlights.</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                {options.map((option, index) => (
                    <div key={option.title} className="rounded-[24px] border border-slate-200 bg-white/85 p-5 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-semibold text-slate-900 dark:text-white">{option.title}</p>
                                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{option.description}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    const next = [...enabled];
                                    next[index] = !next[index];
                                    setEnabled(next);
                                }}
                                className={`relative h-7 w-12 rounded-full transition ${enabled[index] ? "bg-sky-600" : "bg-slate-300 dark:bg-slate-700"}`}
                            >
                                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${enabled[index] ? "left-6" : "left-1"}`} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-slate-900 p-6 text-white shadow-[0_20px_60px_-20px_rgba(15,23,42,0.4)] dark:border-slate-700 dark:bg-slate-950">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="rounded-2xl bg-amber-400/15 p-2 text-amber-300">
                        <ShieldCheck size={18} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">Security</p>
                        <h3 className="text-xl font-semibold">Preferred protection settings</h3>
                    </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                        <div className="flex items-center gap-2 text-amber-300"><Bell size={16} /> Alerts</div>
                        <p className="mt-2 text-sm text-slate-300">Daily summaries and event reminders.</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                        <div className="flex items-center gap-2 text-amber-300"><Lock size={16} /> Privacy</div>
                        <p className="mt-2 text-sm text-slate-300">Control who sees your profile and calendar details.</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                        <div className="flex items-center gap-2 text-amber-300"><MoonStar size={16} /> Appearance</div>
                        <p className="mt-2 text-sm text-slate-300">Soft blue surfaces with gold highlights for clarity.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
