"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
    Award,
    ArrowLeft,
    Building2,
    CalendarDays,
    CircleAlert,
    Clock3,
    FileSpreadsheet,
    FileText,
    LoaderCircle,
    MapPin,
    Pencil,
    PlusCircle,
    Trash2,
    UserRound,
    UsersRound,
    X,
} from "lucide-react";
import { CertificateGenerationModal } from "@/components/dashboard/certificate-generation-modal";
import type {
    EventSessionInput,
    EventSessionRecord,
    EventSessionsResponse,
    SessionLocations,
} from "@/lib/event-sessions";
import type { EventRecord } from "@/lib/events";
import { downloadAuthenticatedFile } from "@/lib/supabase/authenticated-download";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";

type ExportFormat = "csv" | "excel";

type SessionFormValues = {
    session_topic: string;
    session_speaker_id: string;
    session_date: string;
    session_start_time: string;
    session_end_time: string;
    session_building_id: string;
    session_floor_id: string;
    session_room_id: string;
    session_type: string;
    session_max_capacity: string;
    status: string;
};

const emptyLocations: SessionLocations = {
    buildings: [],
    floors: [],
    rooms: [],
};

const emptyForm: SessionFormValues = {
    session_topic: "",
    session_speaker_id: "",
    session_date: "",
    session_start_time: "09:00",
    session_end_time: "10:00",
    session_building_id: "",
    session_floor_id: "",
    session_room_id: "",
    session_type: "1",
    session_max_capacity: "",
    status: "1",
};

const dayFormatter = new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
});

function localDateInput(date: Date) {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return localDate.toISOString().slice(0, 10);
}

function localTimeInput(date: Date) {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
}

function displayTime(time: string) {
    const [hours, minutes] = time.split(":").map(Number);
    const date = new Date(2000, 0, 1, hours, minutes);
    return date.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
}

function sessionSort(left: EventSessionRecord, right: EventSessionRecord) {
    return `${left.session_date} ${left.session_start_time}`.localeCompare(
        `${right.session_date} ${right.session_start_time}`,
    );
}

function sessionTypeLabel(type: number | null) {
    if (type === 1) return "On-site meeting";
    if (type === 2) return "Online meeting";
    return "Type not set";
}

function sessionStatusLabel(status: number | null) {
    return status === 1 ? "Visible" : "Invisible / inactive";
}

function isAuthenticationError(message: string) {
    const normalized = message.toLowerCase();
    return normalized.includes("sign in") || normalized.includes("session");
}

export function SessionsManager({ eventId }: { eventId: string }) {
    const [event, setEvent] = useState<EventRecord | null>(null);
    const [sessions, setSessions] = useState<EventSessionRecord[]>([]);
    const [locations, setLocations] = useState<SessionLocations>(emptyLocations);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSession, setEditingSession] = useState<EventSessionRecord | null>(null);
    const [form, setForm] = useState<SessionFormValues>(emptyForm);
    const [isSaving, setIsSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [exporting, setExporting] = useState<{ sessionId: number; format: ExportFormat } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [modalError, setModalError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [certificateSession, setCertificateSession] = useState<EventSessionRecord | null>(null);

    useEffect(() => {
        let active = true;

        authenticatedFetch<EventSessionsResponse>(`/api/events/${eventId}/sessions`)
            .then((response) => {
                if (!active) return;
                setEvent(response.event);
                setSessions(response.sessions);
                setLocations(response.locations);
            })
            .catch((loadError: unknown) => {
                if (active) {
                    setError(loadError instanceof Error ? loadError.message : "Unable to load sessions.");
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
        if (!isModalOpen) return;

        function closeOnEscape(keyboardEvent: KeyboardEvent) {
            if (keyboardEvent.key === "Escape" && !isSaving) setIsModalOpen(false);
        }

        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [isModalOpen, isSaving]);

    const availableFloors = locations.floors.filter(
        (floor) => String(floor.building_id) === form.session_building_id,
    );
    const availableRooms = locations.rooms.filter(
        (room) =>
            String(room.building_id) === form.session_building_id &&
            String(room.floor_id) === form.session_floor_id,
    );

    function createLocationDefaults() {
        const room = locations.rooms[0];
        const floor = room
            ? locations.floors.find((candidate) => candidate.id === room.floor_id)
            : locations.floors[0];
        const building = room
            ? locations.buildings.find((candidate) => candidate.id === room.building_id)
            : locations.buildings[0];

        return {
            session_building_id: building ? String(building.id) : "",
            session_floor_id: floor ? String(floor.id) : "",
            session_room_id: room ? String(room.id) : "",
        };
    }

    function openCreateModal() {
        const start = event ? new Date(event.start_datetime) : new Date();
        const end = new Date(start.getTime() + 60 * 60 * 1000);

        setEditingSession(null);
        setForm({
            ...emptyForm,
            ...createLocationDefaults(),
            session_date: localDateInput(start),
            session_start_time: localTimeInput(start),
            session_end_time: localTimeInput(end),
        });
        setModalError(null);
        setNotice(null);
        setIsModalOpen(true);
    }

    function openEditModal(session: EventSessionRecord) {
        setEditingSession(session);
        setForm({
            session_topic: session.session_topic,
            session_speaker_id: session.session_speaker_id || "",
            session_date: session.session_date,
            session_start_time: session.session_start_time.slice(0, 5),
            session_end_time: session.session_end_time.slice(0, 5),
            session_building_id: String(session.session_building_id),
            session_floor_id: String(session.session_floor_id),
            session_room_id: String(session.session_room_id),
            session_type: session.session_type === 2 ? "2" : "1",
            session_max_capacity:
                session.session_max_capacity === null ? "" : String(session.session_max_capacity),
            status: session.status === 0 ? "0" : "1",
        });
        setModalError(null);
        setNotice(null);
        setIsModalOpen(true);
    }

    function closeModal() {
        if (!isSaving) setIsModalOpen(false);
    }

    function updateForm<Key extends keyof SessionFormValues>(key: Key, value: SessionFormValues[Key]) {
        setForm((current) => ({ ...current, [key]: value }));
    }

    function changeBuilding(buildingId: string) {
        const floor = locations.floors.find((candidate) => String(candidate.building_id) === buildingId);
        const room = floor
            ? locations.rooms.find(
                (candidate) =>
                    String(candidate.building_id) === buildingId && candidate.floor_id === floor.id,
            )
            : undefined;

        setForm((current) => ({
            ...current,
            session_building_id: buildingId,
            session_floor_id: floor ? String(floor.id) : "",
            session_room_id: room ? String(room.id) : "",
        }));
    }

    function changeFloor(floorId: string) {
        const room = locations.rooms.find(
            (candidate) =>
                String(candidate.building_id) === form.session_building_id &&
                String(candidate.floor_id) === floorId,
        );

        setForm((current) => ({
            ...current,
            session_floor_id: floorId,
            session_room_id: room ? String(room.id) : "",
        }));
    }

    function optionalInteger(value: string) {
        return value === "" ? null : Number(value);
    }

    async function saveSession(submitEvent: React.FormEvent<HTMLFormElement>) {
        submitEvent.preventDefault();
        setModalError(null);

        const buildingId = Number(form.session_building_id);
        const floorId = Number(form.session_floor_id);
        const roomId = Number(form.session_room_id);
        const maxCapacity = optionalInteger(form.session_max_capacity);
        const sessionType = Number(form.session_type);
        const status = Number(form.status);

        if (![buildingId, floorId, roomId].every((value) => Number.isSafeInteger(value) && value > 0)) {
            setModalError("Choose a valid building, floor, and room.");
            return;
        }

        if (
            form.session_end_time <= form.session_start_time ||
            (maxCapacity !== null && (!Number.isSafeInteger(maxCapacity) || maxCapacity <= 0)) ||
            ![1, 2].includes(sessionType) ||
            ![0, 1].includes(status)
        ) {
            setModalError("Check the session time, meeting type, visibility, and capacity.");
            return;
        }

        const input: EventSessionInput = {
            session_topic: form.session_topic.trim(),
            session_speaker_id: form.session_speaker_id.trim() || null,
            session_date: form.session_date,
            session_start_time: `${form.session_start_time}:00`,
            session_end_time: `${form.session_end_time}:00`,
            session_building_id: buildingId,
            session_floor_id: floorId,
            session_room_id: roomId,
            session_type: sessionType as 1 | 2,
            session_max_capacity: maxCapacity,
            status: status as 0 | 1,
        };

        setIsSaving(true);

        try {
            const path = editingSession
                ? `/api/events/${eventId}/sessions/${editingSession.id}`
                : `/api/events/${eventId}/sessions`;
            const { session: savedSession } = await authenticatedFetch<{ session: EventSessionRecord }>(
                path,
                {
                    method: editingSession ? "PATCH" : "POST",
                    body: JSON.stringify(input),
                },
            );

            setSessions((current) =>
                (editingSession
                    ? current.map((item) => (item.id === savedSession.id ? savedSession : item))
                    : [...current, savedSession]
                ).sort(sessionSort),
            );
            setNotice(editingSession ? "Session updated successfully." : "Session created successfully.");
            setIsModalOpen(false);
        } catch (saveError) {
            setModalError(saveError instanceof Error ? saveError.message : "Unable to save the session.");
        } finally {
            setIsSaving(false);
        }
    }

    async function deleteSession(session: EventSessionRecord) {
        const confirmed = window.confirm(`Delete “${session.session_topic}”? This cannot be undone.`);
        if (!confirmed) return;

        setDeletingId(session.id);
        setError(null);
        setNotice(null);

        try {
            await authenticatedFetch<{ session: EventSessionRecord }>(
                `/api/events/${eventId}/sessions/${session.id}`,
                { method: "DELETE" },
            );
            setSessions((current) => current.filter((item) => item.id !== session.id));
            setNotice("Session deleted successfully.");
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : "Unable to delete the session.");
        } finally {
            setDeletingId(null);
        }
    }

    async function exportAttendees(session: EventSessionRecord, format: ExportFormat) {
        setExporting({ sessionId: session.id, format });
        setError(null);
        setNotice(null);

        try {
            await downloadAuthenticatedFile(
                `/api/events/${eventId}/sessions/${session.id}/attendees/export?format=${format}`,
            );
            setNotice(
                `${format === "csv" ? "CSV" : "Excel"} attendee export downloaded for “${session.session_topic}”.`,
            );
        } catch (exportError) {
            setError(
                exportError instanceof Error
                    ? exportError.message
                    : "Unable to export session attendees.",
            );
        } finally {
            setExporting(null);
        }
    }

    function locationLabel(session: EventSessionRecord) {
        const building = locations.buildings.find((item) => item.id === session.session_building_id);
        const floor = locations.floors.find((item) => item.id === session.session_floor_id);
        const room = locations.rooms.find((item) => item.id === session.session_room_id);

        return {
            building: building?.building_name || `Building ${session.session_building_id}`,
            floor: floor?.floor_name || `Floor ${session.session_floor_id}`,
            room: room?.room_no || String(session.session_room_id),
        };
    }

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/dashboard/events"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 transition hover:text-sky-500 dark:text-sky-300"
                >
                    <ArrowLeft size={16} /> Back to events
                </Link>
                <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="text-sm font-medium uppercase tracking-[0.3em] text-amber-600 dark:text-amber-300">Event sessions</p>
                        <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">
                            {event?.event_name || (isLoading ? "Loading event…" : "Sessions")}
                        </h1>
                        <p className="mt-2 text-slate-600 dark:text-slate-400">
                            Manage the schedule, speaker, location, and capacity for each session.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={openCreateModal}
                        disabled={!event || isLoading}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 py-3 font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <PlusCircle size={17} /> Add session
                    </button>
                </div>
            </div>

            {notice ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
                    {notice}
                </div>
            ) : null}

            {error ? (
                <div className="flex items-start justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300">
                    <span className="flex items-center gap-2"><CircleAlert size={16} /> {error}</span>
                    {isAuthenticationError(error) ? (
                        <Link href="/" className="shrink-0 font-semibold underline underline-offset-4">Sign in</Link>
                    ) : null}
                </div>
            ) : null}

            {isLoading ? (
                <div className="rounded-[28px] border border-slate-200 bg-white/80 px-6 py-16 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
                    <span className="inline-flex items-center gap-2"><LoaderCircle size={19} className="animate-spin" /> Loading sessions…</span>
                </div>
            ) : sessions.length ? (
                <div className="grid gap-4 lg:grid-cols-2">
                    {sessions.map((session) => {
                        const location = locationLabel(session);
                        return (
                            <article
                                key={session.id}
                                className="rounded-[26px] border border-slate-200 bg-white/85 p-5 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900/70"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-400/15 dark:text-sky-300">
                                                Session #{session.id}
                                            </span>
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${session.status === 1 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}>
                                                {sessionStatusLabel(session.status)}
                                            </span>
                                        </div>
                                        <h2 className="mt-3 text-xl font-semibold text-slate-900 dark:text-white">{session.session_topic}</h2>
                                    </div>
                                    <div className="flex shrink-0 gap-2">
                                        <Link
                                            href={`/dashboard/events/${eventId}/sessions/${session.id}/attendees`}
                                            aria-label={`View attendees for ${session.session_topic}`}
                                            title="View attendees"
                                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-emerald-500 dark:hover:bg-emerald-400/10 dark:hover:text-emerald-300"
                                        >
                                            <UsersRound size={16} /> Attendees
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={() => openEditModal(session)}
                                            aria-label={`Edit ${session.session_topic}`}
                                            className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-sky-500 dark:hover:bg-sky-400/10 dark:hover:text-sky-300"
                                        >
                                            <Pencil size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deleteSession(session)}
                                            disabled={deletingId === session.id}
                                            aria-label={`Delete ${session.session_topic}`}
                                            className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:border-rose-500 dark:hover:bg-rose-400/10 dark:hover:text-rose-300"
                                        >
                                            {deletingId === session.id ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                                    <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/70">
                                        <p className="flex items-center gap-2 font-medium text-slate-900 dark:text-white"><CalendarDays size={15} className="text-sky-600 dark:text-sky-300" /> Date</p>
                                        <p className="mt-1 text-slate-500 dark:text-slate-400">{dayFormatter.format(new Date(`${session.session_date}T00:00:00`))}</p>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/70">
                                        <p className="flex items-center gap-2 font-medium text-slate-900 dark:text-white"><Clock3 size={15} className="text-sky-600 dark:text-sky-300" /> Time</p>
                                        <p className="mt-1 text-slate-500 dark:text-slate-400">{displayTime(session.session_start_time)}–{displayTime(session.session_end_time)}</p>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/70 sm:col-span-2">
                                        <p className="flex items-center gap-2 font-medium text-slate-900 dark:text-white"><MapPin size={15} className="text-amber-600 dark:text-amber-300" /> Location</p>
                                        <p className="mt-1 text-slate-500 dark:text-slate-400">{location.building} · {location.floor} · Room {location.room}</p>
                                    </div>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
                                    <span className="inline-flex items-center gap-2"><UserRound size={15} /> {session.session_speaker_id || "No speaker assigned"}</span>
                                    <span className="inline-flex items-center gap-2"><UsersRound size={15} /> {session.session_max_capacity ? `${session.session_max_capacity} seats` : "No capacity set"}</span>
                                    <span>{sessionTypeLabel(session.session_type)}</span>
                                </div>

                                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                                    <span className="mr-1 text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Export attendees</span>
                                    <button
                                        type="button"
                                        onClick={() => exportAttendees(session, "csv")}
                                        disabled={exporting !== null}
                                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-sky-500 dark:hover:bg-sky-400/10 dark:hover:text-sky-300"
                                    >
                                        {exporting?.sessionId === session.id && exporting.format === "csv" ? <LoaderCircle size={15} className="animate-spin" /> : <FileText size={15} />}
                                        CSV
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => exportAttendees(session, "excel")}
                                        disabled={exporting !== null}
                                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-emerald-500 dark:hover:bg-emerald-400/10 dark:hover:text-emerald-300"
                                    >
                                        {exporting?.sessionId === session.id && exporting.format === "excel" ? <LoaderCircle size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
                                        Excel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setNotice(null);
                                            setCertificateSession(session);
                                        }}
                                        className="ml-auto inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 transition hover:border-amber-400 hover:bg-amber-100 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300 dark:hover:bg-amber-400/20"
                                    >
                                        <Award size={15} /> Generate certificates
                                    </button>
                                </div>
                            </article>
                        );
                    })}
                </div>
            ) : (
                <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900/50">
                    <CalendarDays className="mx-auto text-sky-600 dark:text-sky-300" size={30} />
                    <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">No sessions for this event</h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Add a session to begin building the event schedule.</p>
                </div>
            )}

            {isModalOpen ? (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
                    onMouseDown={(mouseEvent) => {
                        if (mouseEvent.target === mouseEvent.currentTarget) closeModal();
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="session-modal-title"
                        className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-8"
                    >
                        <div className="mb-6 flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-700 dark:text-sky-300">
                                    {editingSession ? "Update session" : "Create session"}
                                </p>
                                <h2 id="session-modal-title" className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
                                    {editingSession ? editingSession.session_topic : "Add a session"}
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={closeModal}
                                disabled={isSaving}
                                aria-label="Close session modal"
                                className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={saveSession} className="space-y-5">
                            {modalError ? (
                                <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300">
                                    <CircleAlert size={16} /> {modalError}
                                </div>
                            ) : null}

                            <div className="grid gap-4 sm:grid-cols-2">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 sm:col-span-2">
                                    <span className="mb-2 block">Session topic</span>
                                    <input
                                        autoFocus
                                        required
                                        minLength={2}
                                        maxLength={300}
                                        value={form.session_topic}
                                        onChange={(inputEvent) => updateForm("session_topic", inputEvent.target.value)}
                                        placeholder="Opening keynote"
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                    />
                                </label>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Speaker ID <span className="font-normal text-slate-400">(optional)</span></span>
                                    <input
                                        value={form.session_speaker_id}
                                        onChange={(inputEvent) => updateForm("session_speaker_id", inputEvent.target.value)}
                                        placeholder="Speaker reference"
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                    />
                                </label>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Session date</span>
                                    <input
                                        required
                                        type="date"
                                        value={form.session_date}
                                        onChange={(inputEvent) => updateForm("session_date", inputEvent.target.value)}
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                    />
                                </label>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Starts</span>
                                    <input
                                        required
                                        type="time"
                                        value={form.session_start_time}
                                        onChange={(inputEvent) => updateForm("session_start_time", inputEvent.target.value)}
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                    />
                                </label>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Ends</span>
                                    <input
                                        required
                                        type="time"
                                        min={form.session_start_time}
                                        value={form.session_end_time}
                                        onChange={(inputEvent) => updateForm("session_end_time", inputEvent.target.value)}
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                    />
                                </label>
                            </div>

                            <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/70">
                                <div className="mb-4 flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><Building2 size={17} className="text-amber-600 dark:text-amber-300" /> Session location</div>
                                <div className="grid gap-4 sm:grid-cols-3">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                        <span className="mb-2 block">Building</span>
                                        <select
                                            required
                                            value={form.session_building_id}
                                            onChange={(inputEvent) => changeBuilding(inputEvent.target.value)}
                                            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                        >
                                            <option value="">Select building</option>
                                            {locations.buildings.map((building) => <option key={building.id} value={building.id}>{building.building_name}</option>)}
                                        </select>
                                    </label>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                        <span className="mb-2 block">Floor</span>
                                        <select
                                            required
                                            value={form.session_floor_id}
                                            onChange={(inputEvent) => changeFloor(inputEvent.target.value)}
                                            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                        >
                                            <option value="">Select floor</option>
                                            {availableFloors.map((floor) => <option key={floor.id} value={floor.id}>{floor.floor_name}</option>)}
                                        </select>
                                    </label>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                        <span className="mb-2 block">Room</span>
                                        <select
                                            required
                                            value={form.session_room_id}
                                            onChange={(inputEvent) => updateForm("session_room_id", inputEvent.target.value)}
                                            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                        >
                                            <option value="">Select room</option>
                                            {availableRooms.map((room) => <option key={room.id} value={room.id}>{room.room_no}</option>)}
                                        </select>
                                    </label>
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-3">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Max capacity <span className="font-normal text-slate-400">(optional)</span></span>
                                    <input
                                        type="number"
                                        min={1}
                                        step={1}
                                        value={form.session_max_capacity}
                                        onChange={(inputEvent) => updateForm("session_max_capacity", inputEvent.target.value)}
                                        placeholder="120"
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                    />
                                </label>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Meeting type</span>
                                    <select
                                        required
                                        value={form.session_type}
                                        onChange={(inputEvent) => updateForm("session_type", inputEvent.target.value)}
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                    >
                                        <option value="1">On-site meeting</option>
                                        <option value="2">Online meeting</option>
                                    </select>
                                    <p className="mt-2 text-xs font-normal text-slate-400">Stored as session_type 1 or 2.</p>
                                </label>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Visibility</span>
                                    <select
                                        required
                                        value={form.status}
                                        onChange={(inputEvent) => updateForm("status", inputEvent.target.value)}
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                    >
                                        <option value="1">Visible</option>
                                        <option value="0">Invisible / inactive</option>
                                    </select>
                                    <p className="mt-2 text-xs font-normal text-slate-400">Stored as status 1 or 0.</p>
                                </label>
                            </div>

                            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    disabled={isSaving}
                                    className="rounded-2xl border border-slate-200 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isSaving ? <LoaderCircle size={17} className="animate-spin" /> : null}
                                    {isSaving ? "Saving…" : editingSession ? "Save changes" : "Create session"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            {certificateSession ? (
                <CertificateGenerationModal
                    target={{
                        kind: "session",
                        eventId: Number(eventId),
                        sessionId: certificateSession.id,
                        sessionName: certificateSession.session_topic,
                    }}
                    onClose={() => setCertificateSession(null)}
                    onCompleted={(message) => setNotice(message)}
                />
            ) : null}
        </div>
    );
}
