"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import {
    CalendarRange,
    CircleAlert,
    Download,
    LoaderCircle,
    ListChecks,
    Pencil,
    PlusCircle,
    QrCode,
    ScanLine,
    Trash2,
    UsersRound,
    X,
} from "lucide-react";
import { EVENT_STATUSES, type EventInput, type EventRecord, type EventStatus } from "@/lib/events";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";

type EventFormValues = {
    event_name: string;
    event_description: string;
    qrcode_value: string;
    start_datetime: string;
    end_datetime: string;
    status: EventStatus;
};

const emptyForm: EventFormValues = {
    event_name: "",
    event_description: "",
    qrcode_value: "",
    start_datetime: "",
    end_datetime: "",
    status: "draft",
};

const dateFormatter = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
});

const qrCardDateFormatter = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
});

const qrCardTimeFormatter = new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
});

function drawRoundedRectangle(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
) {
    const corner = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + corner, y);
    context.lineTo(x + width - corner, y);
    context.quadraticCurveTo(x + width, y, x + width, y + corner);
    context.lineTo(x + width, y + height - corner);
    context.quadraticCurveTo(x + width, y + height, x + width - corner, y + height);
    context.lineTo(x + corner, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - corner);
    context.lineTo(x, y + corner);
    context.quadraticCurveTo(x, y, x + corner, y);
    context.closePath();
}

function fitCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
    if (context.measureText(text).width <= maxWidth) return text;

    let fitted = text;
    while (fitted.length > 1 && context.measureText(`${fitted}…`).width > maxWidth) {
        fitted = fitted.slice(0, -1);
    }
    return `${fitted.trimEnd()}…`;
}

function wrapCanvasText(
    context: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    maxLines: number,
) {
    const words = text.trim().split(/\s+/);
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
        const candidate = currentLine ? `${currentLine} ${word}` : word;
        if (context.measureText(candidate).width <= maxWidth || !currentLine) {
            currentLine = candidate;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }

    if (currentLine) lines.push(currentLine);
    if (lines.length <= maxLines) return lines.map((line) => fitCanvasText(context, line, maxWidth));

    const visibleLines = lines.slice(0, maxLines - 1);
    visibleLines.push(fitCanvasText(context, lines.slice(maxLines - 1).join(" "), maxWidth));
    return visibleLines;
}

function toDateTimeLocal(value: string) {
    const date = new Date(value);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return localDate.toISOString().slice(0, 16);
}

function createDefaultSchedule() {
    const start = new Date();
    start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    return {
        start_datetime: toDateTimeLocal(start.toISOString()),
        end_datetime: toDateTimeLocal(end.toISOString()),
    };
}

function statusClasses(status: EventStatus) {
    switch (status) {
        case "published":
            return "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300";
        case "completed":
            return "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300";
        case "cancelled":
            return "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300";
        default:
            return "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300";
    }
}

function isValidQrValue(value: string) {
    const qrValue = value.trim();
    return Boolean(qrValue) && new TextEncoder().encode(qrValue).length <= 2953;
}

function EventQrImage({ value, title, size = 220 }: { value: string; title: string; size?: number }) {
    const qrValue = value.trim();
    const isTooLong = new TextEncoder().encode(qrValue).length > 2953;

    if (!qrValue || isTooLong) {
        return (
            <div className="flex aspect-square w-full max-w-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-slate-400 dark:border-slate-700 dark:bg-slate-950/70">
                <QrCode size={34} />
                <p className="mt-3 text-xs font-medium">
                    {isTooLong ? "This value is too long to encode as a QR image." : "Enter a QR code value to generate the preview."}
                </p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-[260px] rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <QRCode
                value={qrValue}
                title={title}
                level="L"
                size={size}
                bgColor="#FFFFFF"
                fgColor="#0F172A"
                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                viewBox={`0 0 ${size} ${size}`}
            />
        </div>
    );
}

export function EventsManager() {
    const [events, setEvents] = useState<EventRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<EventRecord | null>(null);
    const [qrEvent, setQrEvent] = useState<EventRecord | null>(null);
    const [form, setForm] = useState<EventFormValues>(emptyForm);
    const [isSaving, setIsSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [modalError, setModalError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [qrDownloadError, setQrDownloadError] = useState<string | null>(null);
    const [isDownloadingQr, setIsDownloadingQr] = useState(false);
    const qrImageRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let active = true;

        authenticatedFetch<{ events: EventRecord[] }>("/api/events")
            .then(({ events: loadedEvents }) => {
                if (active) setEvents(loadedEvents);
            })
            .catch((loadError: unknown) => {
                if (active) {
                    setError(loadError instanceof Error ? loadError.message : "Unable to load events.");
                }
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!isModalOpen && !qrEvent) return;

        function closeOnEscape(event: KeyboardEvent) {
            if (event.key !== "Escape") return;
            if (qrEvent) setQrEvent(null);
            else if (!isSaving) setIsModalOpen(false);
        }

        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [isModalOpen, isSaving, qrEvent]);

    function openCreateModal() {
        setQrEvent(null);
        setEditingEvent(null);
        setForm({ ...emptyForm, ...createDefaultSchedule() });
        setModalError(null);
        setNotice(null);
        setIsModalOpen(true);
    }

    function openEditModal(event: EventRecord) {
        setQrEvent(null);
        setEditingEvent(event);
        setForm({
            event_name: event.event_name,
            event_description: event.event_description,
            qrcode_value: event.qrcode_value || "",
            start_datetime: toDateTimeLocal(event.start_datetime),
            end_datetime: toDateTimeLocal(event.end_datetime),
            status: event.status,
        });
        setModalError(null);
        setNotice(null);
        setIsModalOpen(true);
    }

    function openQrModal(event: EventRecord) {
        setQrDownloadError(null);
        setQrEvent(event);
    }

    function closeModal() {
        if (!isSaving) setIsModalOpen(false);
    }

    function updateForm<Key extends keyof EventFormValues>(key: Key, value: EventFormValues[Key]) {
        setForm((current) => ({ ...current, [key]: value }));
    }

    async function saveEvent(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setModalError(null);

        const start = new Date(form.start_datetime);
        const end = new Date(form.end_datetime);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
            setModalError("Choose a valid schedule with an end time after the start time.");
            return;
        }

        const input: EventInput = {
            event_name: form.event_name.trim(),
            event_description: form.event_description.trim(),
            qrcode_value: form.qrcode_value.trim() || null,
            start_datetime: start.toISOString(),
            end_datetime: end.toISOString(),
            status: form.status,
        };

        setIsSaving(true);

        try {
            const path = editingEvent ? `/api/events/${editingEvent.id}` : "/api/events";
            const { event: savedEvent } = await authenticatedFetch<{ event: EventRecord }>(path, {
                method: editingEvent ? "PATCH" : "POST",
                body: JSON.stringify(input),
            });

            setEvents((current) =>
                editingEvent
                    ? current.map((item) => (item.id === savedEvent.id ? savedEvent : item))
                    : [savedEvent, ...current],
            );
            setNotice(editingEvent ? "Event updated successfully." : "Event created successfully.");
            setIsModalOpen(false);
        } catch (saveError) {
            setModalError(saveError instanceof Error ? saveError.message : "Unable to save the event.");
        } finally {
            setIsSaving(false);
        }
    }

    async function deleteEvent(event: EventRecord) {
        const confirmed = window.confirm(`Delete “${event.event_name}”? This cannot be undone.`);
        if (!confirmed) return;

        setDeletingId(event.id);
        setError(null);
        setNotice(null);

        try {
            const { deletedSessionCount } = await authenticatedFetch<{
                event: EventRecord;
                deletedSessionCount: number;
            }>(`/api/events/${event.id}`, {
                method: "DELETE",
            });
            setEvents((current) => current.filter((item) => item.id !== event.id));
            setNotice(
                deletedSessionCount
                    ? `Event and ${deletedSessionCount} related session${deletedSessionCount === 1 ? "" : "s"} deleted successfully.`
                    : "Event deleted successfully.",
            );
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : "Unable to delete the event.");
        } finally {
            setDeletingId(null);
        }
    }

    function downloadQrCode() {
        if (!qrEvent) return;

        const qrSvg = qrImageRef.current?.querySelector("svg");
        if (!qrSvg) {
            setQrDownloadError("There is no valid QR code image to download.");
            return;
        }

        setIsDownloadingQr(true);
        setQrDownloadError(null);

        const svgCopy = qrSvg.cloneNode(true) as SVGSVGElement;
        svgCopy.setAttribute("xmlns", "http://www.w3.org/2000/svg");

        const svgBlob = new Blob([new XMLSerializer().serializeToString(svgCopy)], {
            type: "image/svg+xml;charset=utf-8",
        });
        const svgUrl = URL.createObjectURL(svgBlob);
        const image = new Image();

        image.onload = () => {
            URL.revokeObjectURL(svgUrl);

            try {
                const outputWidth = 1200;
                const outputHeight = 1600;
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d");

                if (!context) throw new Error("Canvas is unavailable.");

                canvas.width = outputWidth;
                canvas.height = outputHeight;

                const background = context.createLinearGradient(0, 0, outputWidth, outputHeight);
                background.addColorStop(0, "#071426");
                background.addColorStop(0.5, "#14224A");
                background.addColorStop(1, "#4C1D95");
                context.fillStyle = background;
                context.fillRect(0, 0, outputWidth, outputHeight);

                const topGlow = context.createRadialGradient(1050, 120, 0, 1050, 120, 620);
                topGlow.addColorStop(0, "rgba(56, 189, 248, 0.38)");
                topGlow.addColorStop(1, "rgba(56, 189, 248, 0)");
                context.fillStyle = topGlow;
                context.fillRect(0, 0, outputWidth, 760);

                const bottomGlow = context.createRadialGradient(80, 1500, 0, 80, 1500, 560);
                bottomGlow.addColorStop(0, "rgba(245, 158, 11, 0.3)");
                bottomGlow.addColorStop(1, "rgba(245, 158, 11, 0)");
                context.fillStyle = bottomGlow;
                context.fillRect(0, 900, 700, 700);

                context.strokeStyle = "rgba(255, 255, 255, 0.08)";
                context.lineWidth = 2;
                context.beginPath();
                context.arc(1080, 120, 250, 0, Math.PI * 2);
                context.stroke();
                context.beginPath();
                context.arc(1080, 120, 340, 0, Math.PI * 2);
                context.stroke();

                drawRoundedRectangle(context, 86, 82, 278, 54, 27);
                context.fillStyle = "rgba(255, 255, 255, 0.12)";
                context.fill();
                context.fillStyle = "#BAE6FD";
                context.font = "700 23px Arial, sans-serif";
                context.textAlign = "center";
                context.fillText("EVENT ACCESS PASS", 225, 117);

                context.textAlign = "left";
                context.fillStyle = "#FFFFFF";
                context.font = "700 66px Arial, sans-serif";
                const eventNameLines = wrapCanvasText(context, qrEvent.event_name, 1028, 3);
                eventNameLines.forEach((line, index) => {
                    context.fillText(line, 86, 225 + index * 78);
                });

                const startsAt = new Date(qrEvent.start_datetime);
                const endsAt = new Date(qrEvent.end_datetime);
                const scheduleY = 245 + eventNameLines.length * 78;
                const sameDay = startsAt.toDateString() === endsAt.toDateString();
                const dateLabel = sameDay
                    ? qrCardDateFormatter.format(startsAt)
                    : `${qrCardDateFormatter.format(startsAt)} — ${qrCardDateFormatter.format(endsAt)}`;
                const timeLabel = sameDay
                    ? `${qrCardTimeFormatter.format(startsAt)} — ${qrCardTimeFormatter.format(endsAt)}`
                    : "Multi-day event";

                context.fillStyle = "#FDE68A";
                context.font = "700 25px Arial, sans-serif";
                context.fillText(fitCanvasText(context, dateLabel.toUpperCase(), 1028), 88, scheduleY);
                context.fillStyle = "#CBD5E1";
                context.font = "400 28px Arial, sans-serif";
                context.fillText(timeLabel, 88, scheduleY + 43);

                const panelX = 140;
                const panelY = 570;
                const panelWidth = 920;
                const panelHeight = 820;
                context.save();
                context.shadowColor = "rgba(2, 6, 23, 0.35)";
                context.shadowBlur = 45;
                context.shadowOffsetY = 22;
                drawRoundedRectangle(context, panelX, panelY, panelWidth, panelHeight, 54);
                context.fillStyle = "#FFFFFF";
                context.fill();
                context.restore();

                drawRoundedRectangle(context, 405, 620, 390, 50, 25);
                context.fillStyle = "#EDE9FE";
                context.fill();
                context.fillStyle = "#6D28D9";
                context.font = "700 21px Arial, sans-serif";
                context.textAlign = "center";
                context.fillText("SCAN FOR EVENT ACCESS", 600, 653);

                const qrSize = 620;
                const qrX = (outputWidth - qrSize) / 2;
                const qrY = 710;
                context.drawImage(image, qrX, qrY, qrSize, qrSize);

                context.fillStyle = "#475569";
                context.font = "500 22px Arial, sans-serif";
                context.fillText("Present this code at registration", 600, 1355);

                context.fillStyle = "rgba(255, 255, 255, 0.76)";
                context.font = "600 22px Arial, sans-serif";
                context.fillText("QMO  •  EVENT MANAGEMENT", 600, 1505);
                context.fillStyle = "rgba(255, 255, 255, 0.48)";
                context.font = "400 18px Arial, sans-serif";
                context.fillText("SECURE DIGITAL EVENT PASS", 600, 1542);

                canvas.toBlob((pngBlob) => {
                    if (!pngBlob) {
                        setQrDownloadError("Unable to create the QR code image.");
                        setIsDownloadingQr(false);
                        return;
                    }

                    const safeEventName = qrEvent.event_name
                        .trim()
                        .replace(/[<>:"/\\|?*]/g, "")
                        .replace(/\s+/g, "-");
                    const pngUrl = URL.createObjectURL(pngBlob);
                    const downloadLink = document.createElement("a");
                    downloadLink.href = pngUrl;
                    downloadLink.download = `${safeEventName || "event"}-qr-code.png`;
                    document.body.appendChild(downloadLink);
                    downloadLink.click();
                    downloadLink.remove();
                    window.setTimeout(() => URL.revokeObjectURL(pngUrl), 0);
                    setIsDownloadingQr(false);
                }, "image/png");
            } catch {
                setQrDownloadError("Unable to create the QR code image.");
                setIsDownloadingQr(false);
            }
        };

        image.onerror = () => {
            URL.revokeObjectURL(svgUrl);
            setQrDownloadError("Unable to prepare the QR code image for download.");
            setIsDownloadingQr(false);
        };

        image.src = svgUrl;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="text-sm font-medium uppercase tracking-[0.3em] text-sky-700 dark:text-sky-300">Planning</p>
                    <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Events Overview</h1>
                    <p className="mt-2 text-slate-600 dark:text-slate-400">Create and manage events stored in your Supabase database.</p>
                </div>
                <button
                    type="button"
                    onClick={openCreateModal}
                    className="flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 font-semibold text-amber-800 transition hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300 dark:hover:bg-amber-400/20"
                >
                    <PlusCircle size={16} /> New event
                </button>
            </div>

            {notice ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
                    {notice}
                </div>
            ) : null}

            {error ? (
                <div className="flex items-start justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300">
                    <span className="flex items-center gap-2"><CircleAlert size={16} /> {error}</span>
                    {error.toLowerCase().includes("sign in") || error.toLowerCase().includes("session") ? (
                        <Link href="/" className="shrink-0 font-semibold underline underline-offset-4">Sign in</Link>
                    ) : null}
                </div>
            ) : null}

            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white/85 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1220px] border-collapse text-left">
                        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-400">
                            <tr>
                                <th className="px-5 py-4 font-semibold">Event</th>
                                <th className="px-5 py-4 font-semibold">Schedule</th>
                                <th className="px-5 py-4 font-semibold">Status</th>
                                <th className="px-5 py-4 font-semibold">Created</th>
                                <th className="px-5 py-4 text-right font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="px-5 py-14 text-center text-slate-500 dark:text-slate-400">
                                        <span className="inline-flex items-center gap-2"><LoaderCircle size={18} className="animate-spin" /> Loading events…</span>
                                    </td>
                                </tr>
                            ) : events.length ? events.map((event) => (
                                <tr key={event.id} className="transition hover:bg-slate-50/80 dark:hover:bg-white/[0.03]">
                                    <td className="max-w-sm px-5 py-4">
                                        <div className="flex items-start gap-3">
                                            <span className="mt-0.5 rounded-xl bg-sky-100 p-2 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300">
                                                <CalendarRange size={16} />
                                            </span>
                                            <div>
                                                <p className="font-semibold text-slate-900 dark:text-white">{event.event_name}</p>
                                                <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{event.event_description}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">
                                        <p>{dateFormatter.format(new Date(event.start_datetime))}</p>
                                        <p className="mt-1 text-slate-400">to {dateFormatter.format(new Date(event.end_datetime))}</p>
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusClasses(event.status)}`}>
                                            {event.status}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-sm text-slate-500 dark:text-slate-400">
                                        {dateFormatter.format(new Date(event.created_at))}
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex justify-end gap-2">
                                            <Link
                                                href={`/dashboard/events/${event.id}/scan`}
                                                aria-label={`Scan attendees for ${event.event_name}`}
                                                title="Open attendee scanner"
                                                className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-violet-500 dark:hover:bg-violet-400/10 dark:hover:text-violet-300"
                                            >
                                                <ScanLine size={16} />
                                            </Link>
                                            <Link
                                                href={`/dashboard/events/${event.id}/sessions`}
                                                aria-label={`View sessions for ${event.event_name}`}
                                                title="View sessions"
                                                className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-amber-500 dark:hover:bg-amber-400/10 dark:hover:text-amber-300"
                                            >
                                                <ListChecks size={16} />
                                            </Link>
                                            <Link
                                                href={`/dashboard/events/${event.id}/attendees`}
                                                aria-label={`View attendees for ${event.event_name}`}
                                                title="View attendees"
                                                className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-emerald-500 dark:hover:bg-emerald-400/10 dark:hover:text-emerald-300"
                                            >
                                                <UsersRound size={16} />
                                            </Link>
                                            <button
                                                type="button"
                                                onClick={() => openQrModal(event)}
                                                aria-label={`View QR code for ${event.event_name}`}
                                                title="View QR code"
                                                className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-violet-500 dark:hover:bg-violet-400/10 dark:hover:text-violet-300"
                                            >
                                                <QrCode size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => openEditModal(event)}
                                                aria-label={`Edit ${event.event_name}`}
                                                title="Edit event"
                                                className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-sky-500 dark:hover:bg-sky-400/10 dark:hover:text-sky-300"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => deleteEvent(event)}
                                                disabled={deletingId === event.id}
                                                aria-label={`Delete ${event.event_name}`}
                                                title="Delete event"
                                                className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:border-rose-500 dark:hover:bg-rose-400/10 dark:hover:text-rose-300"
                                            >
                                                {deletingId === event.id ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={5} className="px-5 py-14 text-center">
                                        <p className="font-semibold text-slate-900 dark:text-white">No events yet</p>
                                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Create your first event to add it to this table.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen ? (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) closeModal();
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="event-modal-title"
                        className="max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-8"
                    >
                        <div className="mb-6 flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-700 dark:text-sky-300">
                                    {editingEvent ? "Update event" : "Create event"}
                                </p>
                                <h2 id="event-modal-title" className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
                                    {editingEvent ? editingEvent.event_name : "Add a new event"}
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={closeModal}
                                disabled={isSaving}
                                aria-label="Close event modal"
                                className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={saveEvent} className="space-y-5">
                            {modalError ? (
                                <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300">
                                    <CircleAlert size={16} /> {modalError}
                                </div>
                            ) : null}

                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                <span className="mb-2 block">Event name</span>
                                <input
                                    autoFocus
                                    required
                                    minLength={2}
                                    maxLength={160}
                                    value={form.event_name}
                                    onChange={(event) => updateForm("event_name", event.target.value)}
                                    placeholder="Annual leadership summit"
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600"
                                />
                            </label>

                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                <span className="mb-2 block">Description</span>
                                <textarea
                                    required
                                    rows={4}
                                    maxLength={5000}
                                    value={form.event_description}
                                    onChange={(event) => updateForm("event_description", event.target.value)}
                                    placeholder="Describe the event and its purpose…"
                                    className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600"
                                />
                            </label>

                            <div className="grid items-start gap-5 rounded-3xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/50 md:grid-cols-[minmax(0,1fr)_220px]">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">QR code value</span>
                                    <textarea
                                        rows={6}
                                        maxLength={2953}
                                        value={form.qrcode_value}
                                        onChange={(event) => updateForm("qrcode_value", event.target.value)}
                                        placeholder="Enter a URL, registration code, or other value to encode…"
                                        className="w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600"
                                    />
                                    <p className="mt-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                                        This value is stored in nu_events.qrcode_value. The QR image updates as you type.
                                    </p>
                                </label>
                                <div>
                                    <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Live preview</p>
                                    <EventQrImage
                                        value={form.qrcode_value}
                                        title={`${form.event_name || "Event"} QR code preview`}
                                        size={220}
                                    />
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Starts</span>
                                    <input
                                        required
                                        type="datetime-local"
                                        value={form.start_datetime}
                                        onChange={(event) => updateForm("start_datetime", event.target.value)}
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                    />
                                </label>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Ends</span>
                                    <input
                                        required
                                        type="datetime-local"
                                        min={form.start_datetime}
                                        value={form.end_datetime}
                                        onChange={(event) => updateForm("end_datetime", event.target.value)}
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                    />
                                </label>
                            </div>

                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                <span className="mb-2 block">Status</span>
                                <select
                                    value={form.status}
                                    onChange={(event) => updateForm("status", event.target.value as EventStatus)}
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 capitalize text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                >
                                    {EVENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                                </select>
                            </label>

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
                                    {isSaving ? "Saving…" : editingEvent ? "Save changes" : "Create event"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            {qrEvent ? (
                <div
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) setQrEvent(null);
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="event-qr-title"
                        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-6 text-center shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-8"
                    >
                        <div className="flex items-start justify-between gap-4 text-left">
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-violet-600 dark:text-violet-300">Event QR code</p>
                                <h2 id="event-qr-title" className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
                                    {qrEvent.event_name}
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setQrEvent(null)}
                                aria-label="Close QR code"
                                className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div ref={qrImageRef} className="mt-6 flex justify-center">
                            <EventQrImage
                                value={qrEvent.qrcode_value || ""}
                                title={`${qrEvent.event_name} QR code`}
                                size={260}
                            />
                        </div>

                        {qrEvent.qrcode_value ? (
                            <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-left dark:bg-slate-950/70">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Encoded value</p>
                                <p className="mt-2 max-h-28 overflow-y-auto break-all text-sm text-slate-700 dark:text-slate-300">
                                    {qrEvent.qrcode_value}
                                </p>
                            </div>
                        ) : (
                            <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
                                No qrcode_value is saved for this event. Edit the event to add one.
                            </p>
                        )}

                        {qrDownloadError ? (
                            <p className="mt-4 text-sm text-rose-600 dark:text-rose-300">{qrDownloadError}</p>
                        ) : null}

                        <div className="mt-6 grid gap-3 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={downloadQrCode}
                                disabled={!isValidQrValue(qrEvent.qrcode_value || "") || isDownloadingQr}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-5 py-3 font-semibold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300 dark:hover:bg-violet-400/20"
                            >
                                {isDownloadingQr ? <LoaderCircle size={17} className="animate-spin" /> : <Download size={17} />}
                                {isDownloadingQr ? "Preparing…" : "Download QR card"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setQrEvent(null)}
                                className="rounded-2xl bg-violet-600 px-5 py-3 font-semibold text-white transition hover:bg-violet-500"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
