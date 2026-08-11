"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
    ArrowLeft,
    CalendarDays,
    CheckCircle2,
    CircleAlert,
    Clock3,
    ExternalLink,
    LoaderCircle,
    Radio,
    UserRound,
} from "lucide-react";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";
import {
    type AttendanceState,
    type UserAttendanceResponse,
    userDisplayName,
} from "@/lib/users";

const dateTimeFormatter = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
});

function stateDetails(state: AttendanceState) {
    switch (state) {
        case "currently_attending":
            return {
                label: "Currently attending",
                icon: Radio,
                classes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
            };
        case "attended":
            return {
                label: "Attended",
                icon: CheckCircle2,
                classes: "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
            };
        default:
            return {
                label: "Registered",
                icon: CalendarDays,
                classes: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
            };
    }
}

export function UserAttendance({ userId }: { userId: string }) {
    const [data, setData] = useState<UserAttendanceResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        authenticatedFetch<UserAttendanceResponse>(`/api/users/${userId}/attendance`)
            .then((response) => {
                if (active) setData(response);
            })
            .catch((loadError: unknown) => {
                if (active) {
                    setError(loadError instanceof Error ? loadError.message : "Unable to load attendance.");
                }
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        return () => {
            active = false;
        };
    }, [userId]);

    return (
        <div className="space-y-6">
            <div>
                <Link href="/dashboard/users" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 transition hover:text-sky-500 dark:text-sky-300">
                    <ArrowLeft size={16} /> Back to users
                </Link>
                <div className="mt-4">
                    <p className="text-sm font-medium uppercase tracking-[0.3em] text-amber-600 dark:text-amber-300">Attendance history</p>
                    <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">
                        {data ? userDisplayName(data.user) : isLoading ? "Loading user…" : "User attendance"}
                    </h1>
                    {data ? <p className="mt-2 text-slate-600 dark:text-slate-400">{data.user.email}</p> : null}
                </div>
            </div>

            {error ? (
                <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300">
                    <CircleAlert size={16} /> {error}
                </div>
            ) : null}

            {isLoading ? (
                <div className="rounded-[28px] border border-slate-200 bg-white/80 px-6 py-16 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
                    <span className="inline-flex items-center gap-2"><LoaderCircle size={19} className="animate-spin" /> Loading attendance…</span>
                </div>
            ) : data?.attendance.length ? (
                <div className="grid gap-4 lg:grid-cols-2">
                    {data.attendance.map((attendance) => {
                        const details = stateDetails(attendance.state);
                        const StateIcon = details.icon;

                        return (
                            <article key={attendance.event_id} className="rounded-[26px] border border-slate-200 bg-white/85 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${details.classes}`}>
                                            <StateIcon size={13} /> {details.label}
                                        </span>
                                        <h2 className="mt-3 text-xl font-semibold text-slate-900 dark:text-white">
                                            {attendance.event?.event_name || `Event #${attendance.event_id}`}
                                        </h2>
                                    </div>
                                    {attendance.event ? (
                                        <Link
                                            href={`/dashboard/events/${attendance.event.id}/sessions`}
                                            aria-label={`View sessions for ${attendance.event.event_name}`}
                                            className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-sky-500 dark:hover:bg-sky-400/10 dark:hover:text-sky-300"
                                        >
                                            <ExternalLink size={16} />
                                        </Link>
                                    ) : null}
                                </div>

                                {attendance.event ? (
                                    <div className="mt-4 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                                        <CalendarDays size={15} />
                                        {dateTimeFormatter.format(new Date(attendance.event.start_datetime))}–{dateTimeFormatter.format(new Date(attendance.event.end_datetime))}
                                    </div>
                                ) : null}

                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-2xl bg-slate-50 p-3 text-sm dark:bg-slate-950/70">
                                        <p className="flex items-center gap-2 font-medium text-slate-900 dark:text-white"><Clock3 size={15} className="text-sky-600 dark:text-sky-300" /> First check-in</p>
                                        <p className="mt-1 text-slate-500 dark:text-slate-400">{attendance.first_check_in ? dateTimeFormatter.format(new Date(attendance.first_check_in)) : "Not checked in"}</p>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 p-3 text-sm dark:bg-slate-950/70">
                                        <p className="flex items-center gap-2 font-medium text-slate-900 dark:text-white"><Clock3 size={15} className="text-amber-600 dark:text-amber-300" /> Last check-out</p>
                                        <p className="mt-1 text-slate-500 dark:text-slate-400">{attendance.last_check_out ? dateTimeFormatter.format(new Date(attendance.last_check_out)) : "Not checked out"}</p>
                                    </div>
                                </div>

                                <div className="mt-4">
                                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><UserRound size={15} /> Attended sessions</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {attendance.sessions.length ? attendance.sessions.map((session) => (
                                            <span key={session.id} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                                                {session.session_topic}
                                            </span>
                                        )) : <span className="text-sm text-slate-400">No matching session details</span>}
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            ) : (
                <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900/50">
                    <UserRound className="mx-auto text-sky-600 dark:text-sky-300" size={30} />
                    <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">No event attendance found</h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">This user has no records in nu_event_attendees.</p>
                </div>
            )}
        </div>
    );
}
