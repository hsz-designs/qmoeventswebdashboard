"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
    ArrowLeft,
    BadgeCheck,
    CalendarDays,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    Clock3,
    Coffee,
    LoaderCircle,
    Radio,
    Search,
    UserMinus,
    UserRound,
    UsersRound,
    X,
} from "lucide-react";
import type {
    EventAttendeeDetail,
    EventAttendeesResponse,
    UnregisterAttendeeResponse,
} from "@/lib/event-attendees";
import { attendanceStatusLabel } from "@/lib/event-scanner";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";
import { userDisplayName } from "@/lib/users";

const PAGE_SIZE = 25;

const dateTimeFormatter = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
});

function attendeeName(attendee: EventAttendeeDetail) {
    if (attendee.user) return userDisplayName(attendee.user);
    if (attendee.attendance.user_id) return `User ${attendee.attendance.user_id.slice(0, 8)}…`;
    return "Unknown attendee";
}

function stateDetails(state: EventAttendeeDetail["state"]) {
    switch (state) {
        case "currently_attending":
            return {
                label: "Currently attending",
                icon: Radio,
                classes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
            };
        case "on_break":
            return {
                label: "On break",
                icon: Coffee,
                classes: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
            };
        case "completed":
            return {
                label: "Completed",
                icon: BadgeCheck,
                classes: "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
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

function uniqueAttendeeCount(
    attendees: EventAttendeeDetail[],
    predicate: (attendee: EventAttendeeDetail) => boolean,
) {
    return new Set(
        attendees
            .filter(predicate)
            .map((attendee) => attendee.attendance.user_id || `record-${attendee.attendance.id}`),
    ).size;
}

export function EventAttendees({ eventId }: { eventId: string }) {
    const [data, setData] = useState<EventAttendeesResponse | null>(null);
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [unregisterAttendee, setUnregisterAttendee] = useState<EventAttendeeDetail | null>(null);
    const [isUnregistering, setIsUnregistering] = useState(false);
    const [unregisterError, setUnregisterError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        authenticatedFetch<EventAttendeesResponse>(`/api/events/${eventId}/attendees`)
            .then((response) => {
                if (active) setData(response);
            })
            .catch((loadError: unknown) => {
                if (active) {
                    setError(loadError instanceof Error ? loadError.message : "Unable to load attendees.");
                }
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        return () => {
            active = false;
        };
    }, [eventId]);

    useEffect(() => {
        if (!unregisterAttendee) return;

        function closeOnEscape(keyboardEvent: KeyboardEvent) {
            if (keyboardEvent.key === "Escape" && !isUnregistering) {
                setUnregisterAttendee(null);
            }
        }

        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [unregisterAttendee, isUnregistering]);

    const attendees = data?.attendees || [];
    const normalizedQuery = query.trim().toLowerCase();
    const filteredAttendees = normalizedQuery
        ? attendees.filter((attendee) =>
            [
                attendeeName(attendee),
                attendee.user?.email,
                attendee.session?.session_topic,
            ]
                .filter(Boolean)
                .some((value) => value?.toLowerCase().includes(normalizedQuery)),
        )
        : attendees;
    const pageCount = Math.max(1, Math.ceil(filteredAttendees.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount);
    const visibleAttendees = filteredAttendees.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE,
    );
    const totalAttendees = uniqueAttendeeCount(attendees, () => true);
    const checkedIn = uniqueAttendeeCount(attendees, (attendee) =>
        Boolean(attendee.attendance.date_time_first_in),
    );
    const currentlyAttending = uniqueAttendeeCount(
        attendees,
        (attendee) => attendee.state === "currently_attending",
    );

    function openUnregister(attendee: EventAttendeeDetail) {
        setUnregisterError(null);
        setNotice(null);
        setUnregisterAttendee(attendee);
    }

    async function confirmUnregister() {
        if (!unregisterAttendee) return;

        const attendee = unregisterAttendee;
        const sessionId = attendee.attendance.session_id;
        setUnregisterError(null);
        setIsUnregistering(true);
        try {
            const result = await authenticatedFetch<UnregisterAttendeeResponse>(
                `/api/events/${eventId}/sessions/${sessionId}/attendees/${attendee.attendance.id}`,
                { method: "DELETE" },
            );
            setData((current) => current
                ? {
                    ...current,
                    attendees: current.attendees.filter((item) => !(
                        item.attendance.session_id === result.sessionId &&
                        item.attendance.user_id === result.unregisteredUserId
                    )),
                }
                : current,
            );
            setNotice(
                `${attendeeName(attendee)} was unregistered from ${attendee.session?.session_topic || `session #${sessionId}`}. ${result.deletedAttendanceRecords} attendance and ${result.deletedLogRecords} log record(s) were removed.`,
            );
            setUnregisterAttendee(null);
        } catch (unregisterFailure) {
            setUnregisterError(
                unregisterFailure instanceof Error
                    ? unregisterFailure.message
                    : "Unable to unregister the attendee.",
            );
        } finally {
            setIsUnregistering(false);
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <Link href="/dashboard/events" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 transition hover:text-sky-500 dark:text-sky-300">
                    <ArrowLeft size={16} /> Back to events
                </Link>
                <div className="mt-4">
                    <p className="text-sm font-medium uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-300">Event attendees</p>
                    <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">
                        {data?.event.event_name || (isLoading ? "Loading event…" : "Attendees")}
                    </h1>
                    {data ? (
                        <p className="mt-2 flex items-center gap-2 text-slate-600 dark:text-slate-400">
                            <Clock3 size={16} /> {dateTimeFormatter.format(new Date(data.event.start_datetime))}–{dateTimeFormatter.format(new Date(data.event.end_datetime))}
                        </p>
                    ) : null}
                </div>
            </div>

            {error ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300">
                    <span className="flex items-center gap-2"><CircleAlert size={16} /> {error}</span>
                    <Link href="/" className="font-semibold underline underline-offset-4">Sign in</Link>
                </div>
            ) : null}

            {notice ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
                    {notice}
                </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                    <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><UsersRound size={15} /> Attendees</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{totalAttendees}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                    <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><CheckCircle2 size={15} /> Checked in</p>
                    <p className="mt-1 text-2xl font-semibold text-sky-600 dark:text-sky-300">{checkedIn}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                    <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><Radio size={15} /> Currently attending</p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">{currentlyAttending}</p>
                </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                    <Search size={16} />
                    <span className="sr-only">Search attendees</span>
                    <input
                        value={query}
                        onChange={(inputEvent) => {
                            setQuery(inputEvent.target.value);
                            setPage(1);
                        }}
                        placeholder="Search attendee, email, or session"
                        className="w-full bg-transparent text-sm text-slate-900 outline-none dark:text-white"
                    />
                </label>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white/85 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1050px] text-left">
                        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-400">
                            <tr>
                                <th className="px-5 py-4 font-semibold">Attendee</th>
                                <th className="px-5 py-4 font-semibold">Session</th>
                                <th className="px-5 py-4 font-semibold">First in</th>
                                <th className="px-5 py-4 font-semibold">Last out</th>
                                <th className="px-5 py-4 font-semibold">Attendance</th>
                                <th className="px-5 py-4 font-semibold">Status</th>
                                <th className="px-5 py-4 text-right font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {isLoading ? (
                                <tr><td colSpan={7} className="px-5 py-14 text-center text-slate-500 dark:text-slate-400"><span className="inline-flex items-center gap-2"><LoaderCircle size={18} className="animate-spin" /> Loading attendees…</span></td></tr>
                            ) : visibleAttendees.length ? visibleAttendees.map((attendee) => {
                                const details = stateDetails(attendee.state);
                                const StateIcon = details.icon;
                                return (
                                    <tr key={attendee.attendance.id} className="transition hover:bg-slate-50/80 dark:hover:bg-white/[0.03]">
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                <span className="rounded-xl bg-sky-100 p-2 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300"><UserRound size={16} /></span>
                                                <div><p className="font-semibold text-slate-900 dark:text-white">{attendeeName(attendee)}</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{attendee.user?.email || "No profile email"}</p></div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">{attendee.session?.session_topic || `Session #${attendee.attendance.session_id}`}</td>
                                        <td className="px-5 py-4 text-sm text-slate-500 dark:text-slate-400">{attendee.attendance.date_time_first_in ? dateTimeFormatter.format(new Date(attendee.attendance.date_time_first_in)) : "Not checked in"}</td>
                                        <td className="px-5 py-4 text-sm text-slate-500 dark:text-slate-400">{attendee.attendance.date_time_last_out ? dateTimeFormatter.format(new Date(attendee.attendance.date_time_last_out)) : "Not checked out"}</td>
                                        <td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${details.classes}`}><StateIcon size={13} /> {details.label}</span></td>
                                        <td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">{attendanceStatusLabel(attendee.attendance.status)} · {attendee.attendance.status}</span></td>
                                        <td className="px-5 py-4 text-right">
                                            <button
                                                type="button"
                                                onClick={() => openUnregister(attendee)}
                                                disabled={!attendee.attendance.user_id}
                                                title={!attendee.attendance.user_id ? "This record has no user ID." : undefined}
                                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:border-rose-500 dark:hover:bg-rose-400/10 dark:hover:text-rose-300"
                                            >
                                                <UserMinus size={16} /> Unregister
                                            </button>
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr><td colSpan={7} className="px-5 py-14 text-center"><UserRound size={28} className="mx-auto text-sky-600 dark:text-sky-300" /><p className="mt-3 font-semibold text-slate-900 dark:text-white">No attendees found</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">This event has no matching attendee records.</p></td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {!isLoading && filteredAttendees.length ? (
                    <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        <span>Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredAttendees.length)} of {filteredAttendees.length} records</span>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={currentPage === 1} aria-label="Previous attendee page" className="rounded-xl border border-slate-200 p-2 disabled:opacity-40 dark:border-slate-700"><ChevronLeft size={16} /></button>
                            <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={currentPage === pageCount} aria-label="Next attendee page" className="rounded-xl border border-slate-200 p-2 disabled:opacity-40 dark:border-slate-700"><ChevronRight size={16} /></button>
                        </div>
                    </div>
                ) : null}
            </div>

            {unregisterAttendee ? (
                <div
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
                    onMouseDown={(mouseEvent) => {
                        if (mouseEvent.target === mouseEvent.currentTarget && !isUnregistering) {
                            setUnregisterAttendee(null);
                        }
                    }}
                >
                    <div role="alertdialog" aria-modal="true" aria-labelledby="event-unregister-title" aria-describedby="event-unregister-description" className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-8">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-rose-600 dark:text-rose-300"><UserMinus size={16} /> Session registration</p>
                                <h2 id="event-unregister-title" className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Unregister attendee?</h2>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{attendeeName(unregisterAttendee)}</p>
                            </div>
                            <button type="button" onClick={() => setUnregisterAttendee(null)} disabled={isUnregistering} aria-label="Close unregister attendee dialog" className="rounded-xl border border-slate-200 p-2 text-slate-500 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400"><X size={18} /></button>
                        </div>

                        {unregisterError ? (
                            <div className="mt-5 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300"><CircleAlert size={16} /> {unregisterError}</div>
                        ) : null}

                        <p id="event-unregister-description" className="mt-5 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-400/10 dark:text-rose-200">
                            This removes this user&apos;s registration and all activity logs for <span className="font-semibold">{unregisterAttendee.session?.session_topic || `session #${unregisterAttendee.attendance.session_id}`}</span>. Their records in other sessions will remain unchanged.
                        </p>
                        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button type="button" onClick={() => setUnregisterAttendee(null)} disabled={isUnregistering} className="rounded-2xl border border-slate-200 px-5 py-3 font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300">Cancel</button>
                            <button type="button" onClick={confirmUnregister} disabled={isUnregistering} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 font-semibold text-white transition hover:bg-rose-500 disabled:opacity-60">
                                {isUnregistering ? <LoaderCircle size={17} className="animate-spin" /> : <UserMinus size={17} />}
                                {isUnregistering ? "Unregistering…" : "Unregister attendee"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
