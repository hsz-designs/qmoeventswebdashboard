"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, Sparkles, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

const loginSchema = z.object({
    email: z.string().email("Please enter a valid email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
});

const registerSchema = z.object({
    fullName: z.string().min(2, "Full name is required"),
    email: z.string().email("Please enter a valid email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

export function AuthShell() {
    const [mode, setMode] = useState<"login" | "register">("login");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const loginForm = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: { email: "", password: "" },
    });

    const registerForm = useForm<RegisterFormValues>({
        resolver: zodResolver(registerSchema),
        defaultValues: { fullName: "", email: "", password: "" },
    });

    async function handleLogin(values: LoginFormValues) {
        setError(null);
        setLoading(true);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email: values.email,
                password: values.password,
            });

            if (error) throw error;
            router.push("/dashboard");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to sign in right now.");
        } finally {
            setLoading(false);
        }
    }

    async function handleRegister(values: RegisterFormValues) {
        setError(null);
        setLoading(true);

        try {
            const { error } = await supabase.auth.signUp({
                email: values.email,
                password: values.password,
                options: { data: { full_name: values.fullName } },
            });

            if (error) throw error;
            router.push("/dashboard");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to register right now.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="grid min-h-screen gap-8 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.14),_transparent_32%),linear-gradient(135deg,_#f8fbff,_#eef6ff)] px-4 py-10 text-slate-700 transition-colors dark:bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_32%),linear-gradient(135deg,_#020617,_#0f172a)] dark:text-slate-300 lg:grid-cols-[1.05fr_0.95fr] lg:px-10">
            <div className="flex flex-col justify-center rounded-[32px] border border-sky-100 bg-white/80 p-8 shadow-[0_20px_60px_-20px_rgba(59,130,246,0.25)] backdrop-blur-xl transition-colors dark:border-slate-800 dark:bg-slate-950/75 dark:shadow-[0_20px_60px_-20px_rgba(0,0,0,0.65)] lg:p-14">
                <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300">
                    <Sparkles size={16} /> Supabase-ready experience
                </div>
                <h1 className="text-4xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
                    Elevate your operations with a premium command center.
                </h1>
                <p className="mt-4 max-w-xl text-lg text-slate-600 dark:text-slate-400">
                    A refined login and registration experience for teams who need secure access, vibrant analytics, and a beautifully organized calendar.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                    <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 dark:border-sky-400/20 dark:bg-sky-400/10">
                        <p className="text-sm text-slate-500 dark:text-slate-400">Secure auth</p>
                        <p className="font-semibold text-slate-900 dark:text-white">Supabase integrated</p>
                    </div>
                    <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 dark:border-amber-400/20 dark:bg-amber-400/10">
                        <p className="text-sm text-slate-500 dark:text-slate-400">Smart workspace</p>
                        <p className="font-semibold text-slate-900 dark:text-white">Users, events, and calendar</p>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-center">
                <div className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white/90 p-8 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.18)] backdrop-blur transition-colors dark:border-slate-800 dark:bg-slate-950/85 dark:shadow-[0_20px_60px_-20px_rgba(0,0,0,0.65)]">
                    <div className="mb-6 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium uppercase tracking-[0.3em] text-sky-700 dark:text-sky-300">Welcome back</p>
                            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                                {mode === "login" ? "Sign in" : "Create account"}
                            </h2>
                        </div>
                        <div className="rounded-full border border-amber-200 bg-amber-50 p-2 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300">
                            <ShieldCheck size={20} />
                        </div>
                    </div>

                    <div className="mb-6 grid grid-cols-2 rounded-full bg-slate-100 p-1 dark:bg-slate-900">
                        <button
                            type="button"
                            onClick={() => setMode("login")}
                            className={`rounded-full px-3 py-2 text-sm font-medium transition ${mode === "login" ? "bg-sky-600 text-white" : "text-slate-600 dark:text-slate-400"}`}
                        >
                            Log in
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode("register")}
                            className={`rounded-full px-3 py-2 text-sm font-medium transition ${mode === "register" ? "bg-sky-600 text-white" : "text-slate-600 dark:text-slate-400"}`}
                        >
                            Register
                        </button>
                    </div>

                    {error ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300">{error}</div> : null}

                    {mode === "login" ? (
                        <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                            <label className="block text-sm text-slate-700 dark:text-slate-300">
                                <span className="mb-2 block">Email</span>
                                <input
                                    {...loginForm.register("email")}
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none ring-0 transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
                                    placeholder="you@company.com"
                                />
                                {loginForm.formState.errors.email ? <p className="mt-2 text-xs text-rose-300">{loginForm.formState.errors.email.message}</p> : null}
                            </label>
                            <label className="block text-sm text-slate-700 dark:text-slate-300">
                                <span className="mb-2 block">Password</span>
                                <input
                                    type="password"
                                    {...loginForm.register("password")}
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
                                    placeholder="Enter your password"
                                />
                                {loginForm.formState.errors.password ? <p className="mt-2 text-xs text-rose-300">{loginForm.formState.errors.password.message}</p> : null}
                            </label>
                            <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 py-3 font-semibold text-white transition hover:bg-sky-500 disabled:opacity-70">
                                {loading ? "Signing in..." : "Continue to dashboard"}
                                <ArrowRight size={18} />
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
                            <label className="block text-sm text-slate-700 dark:text-slate-300">
                                <span className="mb-2 block">Full name</span>
                                <input
                                    {...registerForm.register("fullName")}
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
                                    placeholder="Alex Morgan"
                                />
                                {registerForm.formState.errors.fullName ? <p className="mt-2 text-xs text-rose-300">{registerForm.formState.errors.fullName.message}</p> : null}
                            </label>
                            <label className="block text-sm text-slate-700 dark:text-slate-300">
                                <span className="mb-2 block">Email</span>
                                <input
                                    {...registerForm.register("email")}
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
                                    placeholder="you@company.com"
                                />
                                {registerForm.formState.errors.email ? <p className="mt-2 text-xs text-rose-300">{registerForm.formState.errors.email.message}</p> : null}
                            </label>
                            <label className="block text-sm text-slate-700 dark:text-slate-300">
                                <span className="mb-2 block">Password</span>
                                <input
                                    type="password"
                                    {...registerForm.register("password")}
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
                                    placeholder="Create a strong password"
                                />
                                {registerForm.formState.errors.password ? <p className="mt-2 text-xs text-rose-300">{registerForm.formState.errors.password.message}</p> : null}
                            </label>
                            <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 py-3 font-semibold text-white transition hover:bg-sky-500 disabled:opacity-70">
                                {loading ? "Creating account..." : "Create account"}
                                <ArrowRight size={18} />
                            </button>
                        </form>
                    )}

                    <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                        Need a hand? <Link href="/dashboard" className="font-medium text-sky-700 dark:text-sky-300">Preview the dashboard</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
