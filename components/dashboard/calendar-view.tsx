"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
    addMonths,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isSameDay,
    isSameMonth,
    startOfMonth,
    startOfWeek,
    subMonths,
} from "date-fns";
import {
    CalendarDays,
    CalendarRange,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    Clock3,
    ListChecks,
    LoaderCircle,
    MapPin,
    Radio,
    Sparkles,
} from "lucide-react";
import type { CalendarEventsResponse, CalendarSessionRecord } from "@/lib/calendar-events";

async function loadCalendar(month: string) {
    const response = await fetch(`/api/calendar?month=${month}`);
    const payload = (await response.json().catch(() => ({}))) as CalendarEventsResponse & { error?: string };

    if (!response.ok) throw new Error(payload.error || "Unable to load calendar sessions.");
    return payload;
}

function sessionsOnDay(sessions: CalendarSessionRecord[], day: Date) {
    const dateKey = format(day, "yyyy-MM-dd");
    return sessions.filter((session) => session.session_date === dateKey);
}

function displayTime(time: string) {
    const [hours, minutes] = time.split(":").map(Number);
    return format(new Date(2000, 0, 1, hours, minutes), "h:mm a");
}

function sessionTimeRange(session: CalendarSessionRecord) {
    return `${displayTime(session.session_start_time)}–${displayTime(session.session_end_time)}`;
}

function meetingTypeLabel(type: number | null) {
    return type === 2 ? "Online meeting" : "On-site meeting";
}

export function CalendarView() {
    const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
    const [selectedDate, setSelectedDate] = useState(() => new Date());
    const [sessions, setSessions] = useState<CalendarSessionRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const monthKey = format(visibleMonth, "yyyy-MM");

    useEffect(() => {
        let active = true;

        loadCalendar(monthKey)
            .then((response) => {
                if (!active) return;
                setSessions(response.sessions);
                setError(null);
            })
            .catch((loadError: unknown) => {
                if (active) {
                    setError(loadError instanceof Error ? loadError.message : "Unable to load the calendar.");
                    setSessions([]);
                }
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        return () => {
            active = false;
        };
    }, [monthKey]);

    const days = eachDayOfInterval({
        start: startOfWeek(startOfMonth(visibleMonth)),
        end: endOfWeek(endOfMonth(visibleMonth)),
    });
    const selectedSessions = sessionsOnDay(sessions, selectedDate);
    const scheduledDayCount = new Set(sessions.map((session) => session.session_date)).size;
    const representedEventCount = new Set(sessions.map((session) => session.session_event_id)).size;

    function changeMonth(nextMonth: Date) {
        const nextStart = startOfMonth(nextMonth);
        setIsLoading(true);
        setError(null);
        setVisibleMonth(nextStart);
        setSelectedDate(nextStart);
    }

    function goToToday() {
        const today = new Date();
        if (format(today, "yyyy-MM") !== monthKey) {
            setIsLoading(true);
            setError(null);
        }
        setVisibleMonth(startOfMonth(today));
        setSelectedDate(today);
    }

    return (
        <div className="space-y-4">
            {error ? (
                <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300">
                    <CircleAlert size={16} /> {error}
                </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                    <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><ListChecks size={15} /> Visible sessions</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{sessions.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                    <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><CalendarDays size={15} /> Scheduled days</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{scheduledDayCount}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                    <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><CalendarRange size={15} /> Events represented</p>
                    <p className="mt-1 text-2xl font-semibold text-violet-600 dark:text-violet-300">{representedEventCount}</p>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
                <div className="rounded-[28px] border border-slate-200 bg-white/80 p-4 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.16)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-[0_20px_60px_-20px_rgba(0,0,0,0.65)] sm:p-6">
                    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-sm font-medium uppercase tracking-[0.3em] text-sky-700 dark:text-sky-300">Session calendar</p>
                            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">{format(visibleMonth, "MMMM yyyy")}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => changeMonth(subMonths(visibleMonth, 1))}
                                aria-label="Previous month"
                                className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-white/5"
                            >
                                <ChevronLeft size={17} />
                            </button>
                            <button
                                type="button"
                                onClick={goToToday}
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5"
                            >
                                Today
                            </button>
                            <button
                                type="button"
                                onClick={() => changeMonth(addMonths(visibleMonth, 1))}
                                aria-label="Next month"
                                className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-white/5"
                            >
                                <ChevronRight size={17} />
                            </button>
                        </div>
                    </div>

                    <div className="mb-3 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400 sm:gap-2 sm:text-xs sm:tracking-[0.22em]">
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day}>{day}</div>)}
                    </div>

                    <div className="grid grid-cols-7 gap-1 sm:gap-2">
                        {days.map((day) => {
                            const daySessions = sessionsOnDay(sessions, day);
                            const selected = isSameDay(day, selectedDate);
                            const outsideMonth = !isSameMonth(day, visibleMonth);

                            return (
                                <button
                                    key={day.toISOString()}
                                    type="button"
                                    aria-pressed={selected}
                                    aria-label={`${format(day, "MMMM d, yyyy")}, ${daySessions.length} session${daySessions.length === 1 ? "" : "s"}`}
                                    onClick={() => {
                                        setSelectedDate(day);
                                        if (outsideMonth) {
                                            setIsLoading(true);
                                            setError(null);
                                            setVisibleMonth(startOfMonth(day));
                                        }
                                    }}
                                    className={`group relative flex h-20 min-w-0 flex-col items-start rounded-xl border p-2 text-left transition sm:h-24 sm:rounded-2xl sm:p-3 ${selected ? "border-sky-500 bg-sky-50 text-slate-900 ring-2 ring-sky-500/15 dark:bg-sky-400/15 dark:text-white" : "border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-300 dark:hover:border-sky-500 dark:hover:bg-sky-400/10"} ${outsideMonth ? "opacity-45" : ""}`}
                                >
                                    <span className="text-xs font-medium sm:text-sm">{format(day, "d")}</span>
                                    <div className="mt-auto w-full space-y-1 overflow-hidden">
                                        {daySessions.slice(0, 2).map((session) => (
                                            <span key={session.id} className="block truncate rounded bg-violet-100 px-1 py-0.5 text-[9px] font-medium text-violet-800 dark:bg-violet-400/15 dark:text-violet-300 sm:text-[10px]">
                                                {session.session_topic}
                                            </span>
                                        ))}
                                        {daySessions.length > 2 ? <span className="block text-[9px] text-slate-400">+{daySessions.length - 2} more</span> : null}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {isLoading ? (
                        <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                            <LoaderCircle size={16} className="animate-spin" /> Loading session dates…
                        </div>
                    ) : null}
                </div>

                <div className="rounded-[28px] border border-slate-200 bg-slate-900 p-6 text-white shadow-[0_20px_60px_-20px_rgba(15,23,42,0.35)] dark:border-slate-700 dark:bg-slate-950">
                    <div className="mb-4 flex items-center gap-2 text-amber-300">
                        <Sparkles size={18} />
                        <p className="text-sm font-medium uppercase tracking-[0.3em]">Selected date</p>
                    </div>
                    <h3 className="text-2xl font-semibold text-white">{format(selectedDate, "EEEE, MMMM d")}</h3>
                    <p className="mt-2 text-sm text-slate-400">Topics scheduled directly from the session date.</p>

                    <div className="mt-6 space-y-3">
                        {selectedSessions.length ? selectedSessions.map((session) => (
                            <article key={session.id} className="rounded-2xl border border-white/10 bg-white/10 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">{session.event.event_name}</p>
                                        <h4 className="mt-2 text-lg font-semibold text-white">{session.session_topic}</h4>
                                    </div>
                                    <Link
                                        href={`/dashboard/events/${session.event.id}/sessions`}
                                        className="shrink-0 rounded-xl bg-sky-400/15 p-2 text-sky-300 transition hover:bg-sky-400/25"
                                        aria-label={`View sessions for ${session.event.event_name}`}
                                        title="View event sessions"
                                    >
                                        <CalendarDays size={16} />
                                    </Link>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2 text-sm">
                                    <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-slate-300">
                                        <Clock3 size={14} className="text-sky-300" /> {sessionTimeRange(session)}
                                    </span>
                                    <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-slate-300">
                                        {session.session_type === 2 ? <Radio size={14} className="text-violet-300" /> : <MapPin size={14} className="text-emerald-300" />}
                                        {meetingTypeLabel(session.session_type)}
                                    </span>
                                </div>
                            </article>
                        )) : (
                            <div className="rounded-2xl border border-dashed border-white/10 bg-white/10 p-5 text-sm text-slate-400">
                                No visible sessions are scheduled for this date.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
