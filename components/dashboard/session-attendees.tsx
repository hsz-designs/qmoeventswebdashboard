"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
    Activity,
    ArrowLeft,
    Award,
    CalendarDays,
    CheckCircle2,
    CircleAlert,
    History,
    LoaderCircle,
    Radio,
    Search,
    UserRound,
    UserMinus,
    UsersRound,
    X,
} from "lucide-react";
import { CertificateGenerationModal } from "@/components/dashboard/certificate-generation-modal";
import type {
    AttendeeLogsResponse,
    EventAttendeeDetail,
    SessionAttendeesResponse,
    UnregisterAttendeeResponse,
} from "@/lib/event-attendees";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";
import { userDisplayName } from "@/lib/users";

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

function uniqueCount(
    attendees: EventAttendeeDetail[],
    predicate: (attendee: EventAttendeeDetail) => boolean,
) {
    return new Set(
        attendees
            .filter(predicate)
            .map((attendee) => attendee.attendance.user_id || `record-${attendee.attendance.id}`),
    ).size;
}

export function SessionAttendees({ eventId, sessionId }: { eventId: string; sessionId: string }) {
    const [data, setData] = useState<SessionAttendeesResponse | null>(null);
    const [query, setQuery] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isLogModalOpen, setIsLogModalOpen] = useState(false);
    const [logs, setLogs] = useState<AttendeeLogsResponse | null>(null);
    const [logsError, setLogsError] = useState<string | null>(null);
    const [logsLoading, setLogsLoading] = useState(false);
    const [unregisterAttendee, setUnregisterAttendee] = useState<EventAttendeeDetail | null>(null);
    const [isUnregistering, setIsUnregistering] = useState(false);
    const [unregisterError, setUnregisterError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [isCertificateModalOpen, setIsCertificateModalOpen] = useState(false);

    useEffect(() => {
        let active = true;

        authenticatedFetch<SessionAttendeesResponse>(
            `/api/events/${eventId}/sessions/${sessionId}/attendees`,
        )
            .then((response) => {
                if (active) setData(response);
            })
            .catch((loadError: unknown) => {
                if (active) {
                    setError(loadError instanceof Error ? loadError.message : "Unable to load session attendees.");
                }
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        return () => {
            active = false;
        };
    }, [eventId, sessionId]);

    useEffect(() => {
        if (!isLogModalOpen && !unregisterAttendee) return;

        function closeOnEscape(keyboardEvent: KeyboardEvent) {
            if (keyboardEvent.key !== "Escape" || isUnregistering) return;
            if (unregisterAttendee) {
                setUnregisterAttendee(null);
                return;
            }
            setIsLogModalOpen(false);
        }

        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [isLogModalOpen, unregisterAttendee, isUnregistering]);

    const attendees = data?.attendees || [];
    const normalizedQuery = query.trim().toLowerCase();
    const visibleAttendees = normalizedQuery
        ? attendees.filter((attendee) =>
            [attendeeName(attendee), attendee.user?.email]
                .filter(Boolean)
                .some((value) => value?.toLowerCase().includes(normalizedQuery)),
        )
        : attendees;
    const attendeeTotal = uniqueCount(attendees, () => true);
    const checkedIn = uniqueCount(attendees, (attendee) =>
        Boolean(attendee.attendance.date_time_first_in),
    );
    const currentlyAttending = uniqueCount(
        attendees,
        (attendee) => attendee.state === "currently_attending",
    );

    async function openLogs(attendee: EventAttendeeDetail) {
        setIsLogModalOpen(true);
        setLogs(null);
        setLogsError(null);
        setLogsLoading(true);

        try {
            const response = await authenticatedFetch<AttendeeLogsResponse>(
                `/api/events/${eventId}/sessions/${sessionId}/attendees/${attendee.attendance.id}/logs`,
            );
            setLogs(response);
        } catch (loadError) {
            setLogsError(loadError instanceof Error ? loadError.message : "Unable to load attendee logs.");
        } finally {
            setLogsLoading(false);
        }
    }

    function openUnregister(attendee: EventAttendeeDetail) {
        setUnregisterError(null);
        setNotice(null);
        setUnregisterAttendee(attendee);
    }

    async function confirmUnregister() {
        if (!unregisterAttendee) return;

        const attendee = unregisterAttendee;
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
                    attendees: current.attendees.filter(
                        (item) => item.attendance.user_id !== result.unregisteredUserId,
                    ),
                }
                : current,
            );
            setNotice(
                `${attendeeName(attendee)} was unregistered from this session. ${result.deletedAttendanceRecords} attendance and ${result.deletedLogRecords} log record(s) were removed.`,
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
                <Link
                    href={`/dashboard/events/${eventId}/sessions`}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 transition hover:text-sky-500 dark:text-sky-300"
                >
                    <ArrowLeft size={16} /> Back to sessions
                </Link>
                <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="text-sm font-medium uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-300">Session attendees</p>
                        <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">
                            {data?.session.session_topic || (isLoading ? "Loading session…" : "Attendees")}
                        </h1>
                        {data ? (
                            <p className="mt-2 text-slate-600 dark:text-slate-400">
                                {data.event.event_name} · {data.session.session_date} · {data.session.session_start_time.slice(0, 5)}–{data.session.session_end_time.slice(0, 5)}
                            </p>
                        ) : null}
                    </div>
                    <button type="button" onClick={() => setIsCertificateModalOpen(true)} disabled={!data || !attendees.length} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 font-semibold text-amber-700 transition hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300 dark:hover:bg-amber-400/20">
                        <Award size={17} /> Generate certificates
                    </button>
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
                    <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{attendeeTotal}</p>
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
                        onChange={(inputEvent) => setQuery(inputEvent.target.value)}
                        placeholder="Search attendee or email"
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
                                <th className="px-5 py-4 font-semibold">First login/check-in</th>
                                <th className="px-5 py-4 font-semibold">Last logout/check-out</th>
                                <th className="px-5 py-4 font-semibold">Attendance</th>
                                <th className="px-5 py-4 font-semibold">Status</th>
                                <th className="px-5 py-4 text-right font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {isLoading ? (
                                <tr><td colSpan={6} className="px-5 py-14 text-center text-slate-500 dark:text-slate-400"><span className="inline-flex items-center gap-2"><LoaderCircle size={18} className="animate-spin" /> Loading attendees…</span></td></tr>
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
                                        <td className="px-5 py-4 text-sm text-slate-500 dark:text-slate-400">{attendee.attendance.date_time_first_in ? dateTimeFormatter.format(new Date(attendee.attendance.date_time_first_in)) : "Not checked in"}</td>
                                        <td className="px-5 py-4 text-sm text-slate-500 dark:text-slate-400">{attendee.attendance.date_time_last_out ? dateTimeFormatter.format(new Date(attendee.attendance.date_time_last_out)) : "Not checked out"}</td>
                                        <td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${details.classes}`}><StateIcon size={13} /> {details.label}</span></td>
                                        <td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">Code {attendee.attendance.status}</span></td>
                                        <td className="px-5 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => openLogs(attendee)}
                                                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-amber-500 dark:hover:bg-amber-400/10 dark:hover:text-amber-300"
                                                >
                                                    <History size={16} /> View logs
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => openUnregister(attendee)}
                                                    disabled={!attendee.attendance.user_id}
                                                    title={!attendee.attendance.user_id ? "This record has no user ID." : undefined}
                                                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:border-rose-500 dark:hover:bg-rose-400/10 dark:hover:text-rose-300"
                                                >
                                                    <UserMinus size={16} /> Unregister
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr><td colSpan={6} className="px-5 py-14 text-center"><UserRound size={28} className="mx-auto text-sky-600 dark:text-sky-300" /><p className="mt-3 font-semibold text-slate-900 dark:text-white">No attendees found</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">This session has no matching nu_event_attendees records.</p></td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isLogModalOpen ? (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
                    onMouseDown={(mouseEvent) => {
                        if (mouseEvent.target === mouseEvent.currentTarget) setIsLogModalOpen(false);
                    }}
                >
                    <div role="dialog" aria-modal="true" aria-labelledby="attendee-logs-title" className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-8">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-600 dark:text-amber-300">Login and logout activity</p>
                                <h2 id="attendee-logs-title" className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{logs ? attendeeName(logs.attendee) : "Attendee activity"}</h2>
                            </div>
                            <button type="button" onClick={() => setIsLogModalOpen(false)} aria-label="Close attendee logs" className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-white/5"><X size={18} /></button>
                        </div>

                        {logsLoading ? (
                            <div className="py-14 text-center text-slate-500 dark:text-slate-400"><span className="inline-flex items-center gap-2"><LoaderCircle size={18} className="animate-spin" /> Loading activity…</span></div>
                        ) : logsError ? (
                            <div className="mt-6 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300"><CircleAlert size={16} /> {logsError}</div>
                        ) : logs ? (
                            <div className="mt-6 space-y-5">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-2xl bg-sky-50 p-4 dark:bg-sky-400/10">
                                        <p className="text-sm font-semibold text-sky-700 dark:text-sky-300">First login/check-in</p>
                                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{logs.attendee.attendance.date_time_first_in ? dateTimeFormatter.format(new Date(logs.attendee.attendance.date_time_first_in)) : "Not recorded"}</p>
                                    </div>
                                    <div className="rounded-2xl bg-amber-50 p-4 dark:bg-amber-400/10">
                                        <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Last logout/check-out</p>
                                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{logs.attendee.attendance.date_time_last_out ? dateTimeFormatter.format(new Date(logs.attendee.attendance.date_time_last_out)) : "Not recorded"}</p>
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between gap-3">
                                        <h3 className="font-semibold text-slate-900 dark:text-white">nu_event_attendees_log timeline</h3>
                                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">{logs.logs.length} records</span>
                                    </div>
                                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">The current dataset only contains log type 1, so each activity code is shown exactly as stored.</p>
                                    <div className="mt-4 space-y-3">
                                        {logs.logs.length ? logs.logs.map((log) => (
                                            <div key={log.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700 dark:bg-slate-950/60">
                                                <span className="rounded-xl bg-amber-100 p-2 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"><Activity size={16} /></span>
                                                <div className="flex-1">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <p className="font-semibold text-slate-900 dark:text-white">Activity code {log.log_type}</p>
                                                        <span className="text-xs text-slate-400">Log #{log.id}</span>
                                                    </div>
                                                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{dateTimeFormatter.format(new Date(log.date_time))}</p>
                                                    {log.date_index !== null ? <p className="mt-1 text-xs text-slate-400">Event day index: {log.date_index}</p> : null}
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No matching log records for this attendee and session.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {unregisterAttendee ? (
                <div
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
                    onMouseDown={(mouseEvent) => {
                        if (mouseEvent.target === mouseEvent.currentTarget && !isUnregistering) {
                            setUnregisterAttendee(null);
                        }
                    }}
                >
                    <div role="alertdialog" aria-modal="true" aria-labelledby="unregister-attendee-title" aria-describedby="unregister-attendee-description" className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-8">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-rose-600 dark:text-rose-300"><UserMinus size={16} /> Session registration</p>
                                <h2 id="unregister-attendee-title" className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Unregister attendee?</h2>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{attendeeName(unregisterAttendee)}</p>
                            </div>
                            <button type="button" onClick={() => setUnregisterAttendee(null)} disabled={isUnregistering} aria-label="Close unregister attendee dialog" className="rounded-xl border border-slate-200 p-2 text-slate-500 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400"><X size={18} /></button>
                        </div>

                        {unregisterError ? (
                            <div className="mt-5 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300"><CircleAlert size={16} /> {unregisterError}</div>
                        ) : null}

                        <p id="unregister-attendee-description" className="mt-5 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-400/10 dark:text-rose-200">
                            This removes this user&apos;s registration and all activity logs for <span className="font-semibold">{data?.session.session_topic || `session #${sessionId}`}</span>. Their records in other sessions will remain unchanged.
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

            {isCertificateModalOpen && data ? (
                <CertificateGenerationModal
                    target={{
                        kind: "session",
                        eventId: Number(eventId),
                        sessionId: Number(sessionId),
                        sessionName: data.session.session_topic,
                    }}
                    onClose={() => setIsCertificateModalOpen(false)}
                    onCompleted={(message) => setNotice(message)}
                />
            ) : null}
        </div>
    );
}
