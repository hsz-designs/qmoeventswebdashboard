"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Award,
    CalendarDays,
    CheckCircle2,
    CircleAlert,
    ExternalLink,
    LoaderCircle,
    Sparkles,
    UserRound,
    X,
} from "lucide-react";
import { CertificatePreview } from "@/components/dashboard/certificate-preview";
import { canvasToBlob, renderCertificateCanvas } from "@/lib/certificate-renderer";
import {
    SAMPLE_CERTIFICATE_DATA,
    createDefaultCertificateTemplates,
    safeCertificateFilename,
    type CertificateBindingData,
    type CertificateIssueResponse,
    type CertificateTemplate,
    type CertificateTemplatesResponse,
} from "@/lib/certificates";
import {
    mergeCertificateTemplates,
    readBrowserCertificateTemplates,
} from "@/lib/certificate-template-storage";
import type { SessionAttendeesResponse } from "@/lib/event-attendees";
import type { EventRecord } from "@/lib/events";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";
import {
    type UserAttendanceResponse,
    type UserRecord,
    userDisplayName,
} from "@/lib/users";

const DEFAULT_TEMPLATES = createDefaultCertificateTemplates();
const MAX_SESSION_CERTIFICATES = 200;
const issuer = "National University QMO Manila";

const eventDateFormatter = new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
});

export type CertificateGenerationTarget =
    | { kind: "user"; user: UserRecord }
    | { kind: "session"; eventId: number; sessionId: number; sessionName: string };

type GenerationResult = CertificateIssueResponse & {
    recipient: string;
};

function formatEventDate(event: EventRecord) {
    const startsAt = new Date(event.start_datetime);
    const endsAt = new Date(event.end_datetime);
    return startsAt.toDateString() === endsAt.toDateString()
        ? eventDateFormatter.format(startsAt)
        : `${eventDateFormatter.format(startsAt)} – ${eventDateFormatter.format(endsAt)}`;
}

function certificateData(user: UserRecord, event: EventRecord): CertificateBindingData {
    return {
        recipientName: userDisplayName(user),
        eventName: event.event_name,
        eventDate: formatEventDate(event),
        issuer,
    };
}

export function CertificateGenerationModal({
    target,
    onClose,
    onCompleted,
}: {
    target: CertificateGenerationTarget;
    onClose: () => void;
    onCompleted?: (message: string) => void;
}) {
    const [events, setEvents] = useState<EventRecord[]>([]);
    const [recipients, setRecipients] = useState<UserRecord[]>([]);
    const [templates, setTemplates] = useState<CertificateTemplate[]>(DEFAULT_TEMPLATES);
    const [selectedEventId, setSelectedEventId] = useState("");
    const [selectedTemplateId, setSelectedTemplateId] = useState(DEFAULT_TEMPLATES[0].id);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState({ completed: 0, total: 0 });
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [skippedRecipientCount, setSkippedRecipientCount] = useState(0);

    const targetKind = target.kind;
    const targetUserId = target.kind === "user" ? target.user.id : null;
    const targetEventId = target.kind === "session" ? target.eventId : null;
    const targetSessionId = target.kind === "session" ? target.sessionId : null;
    const targetKey = targetKind === "user"
        ? `user-${targetUserId}`
        : `session-${targetEventId}-${targetSessionId}`;

    useEffect(() => {
        let active = true;

        async function loadOptions() {
            setIsLoading(true);
            setError(null);
            setNotice(null);
            setResults([]);
            const browserTemplates = readBrowserCertificateTemplates();

            try {
                const templatePromise = authenticatedFetch<CertificateTemplatesResponse>(
                    "/api/certificates/templates",
                ).catch(() => ({ templates: [] }));

                if (targetKind === "user" && targetUserId) {
                    const [attendance, templateResponse] = await Promise.all([
                        authenticatedFetch<UserAttendanceResponse>(
                            `/api/users/${targetUserId}/attendance`,
                        ),
                        templatePromise,
                    ]);
                    if (!active) return;

                    const registeredEvents = attendance.attendance
                        .map((item) => item.event)
                        .filter((event): event is EventRecord => Boolean(event));
                    setEvents(registeredEvents);
                    setRecipients([attendance.user]);
                    setSkippedRecipientCount(0);
                    setSelectedEventId(registeredEvents[0] ? String(registeredEvents[0].id) : "");
                    setTemplates(mergeCertificateTemplates(
                        DEFAULT_TEMPLATES,
                        templateResponse.templates,
                        browserTemplates,
                    ));
                } else {
                    const [sessionResponse, templateResponse] = await Promise.all([
                        authenticatedFetch<SessionAttendeesResponse>(
                            `/api/events/${targetEventId}/sessions/${targetSessionId}/attendees`,
                        ),
                        templatePromise,
                    ]);
                    if (!active) return;

                    const uniqueUsers = new Map<number, UserRecord>();
                    sessionResponse.attendees.forEach((attendee) => {
                        if (attendee.user?.auth_user_id) uniqueUsers.set(attendee.user.id, attendee.user);
                    });
                    const registeredUserIds = new Set(
                        sessionResponse.attendees
                            .map((attendee) => attendee.attendance.user_id)
                            .filter(Boolean),
                    );
                    setEvents([sessionResponse.event]);
                    setRecipients([...uniqueUsers.values()]);
                    setSkippedRecipientCount(Math.max(0, registeredUserIds.size - uniqueUsers.size));
                    setSelectedEventId(String(sessionResponse.event.id));
                    setTemplates(mergeCertificateTemplates(
                        DEFAULT_TEMPLATES,
                        templateResponse.templates,
                        browserTemplates,
                    ));
                }
            } catch (loadError) {
                if (active) {
                    setError(loadError instanceof Error ? loadError.message : "Unable to prepare certificate generation.");
                }
            } finally {
                if (active) setIsLoading(false);
            }
        }

        void loadOptions();
        return () => {
            active = false;
        };
    }, [targetEventId, targetKey, targetKind, targetSessionId, targetUserId]);

    useEffect(() => {
        function closeOnEscape(keyboardEvent: KeyboardEvent) {
            if (keyboardEvent.key === "Escape" && !isGenerating) onClose();
        }
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [isGenerating, onClose]);

    const selectedEvent = events.find((event) => String(event.id) === selectedEventId) || null;
    const selectedTemplate = templates.find((template) => template.id === selectedTemplateId)
        || DEFAULT_TEMPLATES[0];
    const previewData = recipients[0] && selectedEvent
        ? certificateData(recipients[0], selectedEvent)
        : SAMPLE_CERTIFICATE_DATA;
    const recipientSummary = useMemo(
        () => recipients.slice(0, 5).map(userDisplayName),
        [recipients],
    );

    async function generateAndUpload() {
        if (!selectedEvent) {
            setError("Choose one of the user’s registered events.");
            return;
        }
        if (!recipients.length) {
            setError("There are no linked user profiles available for certificate generation.");
            return;
        }
        if (recipients.length > MAX_SESSION_CERTIFICATES) {
            setError(`Generate certificates in batches of ${MAX_SESSION_CERTIFICATES} users or fewer.`);
            return;
        }

        setIsGenerating(true);
        setError(null);
        setNotice(null);
        setResults([]);
        setProgress({ completed: 0, total: recipients.length });

        const completed: GenerationResult[] = [];
        const failures: string[] = [];
        for (const recipient of recipients) {
            try {
                const canvas = await renderCertificateCanvas(
                    selectedTemplate,
                    certificateData(recipient, selectedEvent),
                );
                const blob = await canvasToBlob(canvas, "image/jpeg", 0.94);
                const formData = new FormData();
                formData.set("userId", String(recipient.id));
                formData.set("eventId", String(selectedEvent.id));
                if (target.kind === "session") formData.set("sessionId", String(target.sessionId));
                formData.set("template", JSON.stringify(selectedTemplate));
                formData.set(
                    "certificate",
                    blob,
                    `${safeCertificateFilename(userDisplayName(recipient))}-${safeCertificateFilename(selectedEvent.event_name)}.jpg`,
                );

                const result = await authenticatedFetch<CertificateIssueResponse>(
                    "/api/certificates/issue",
                    { method: "POST", body: formData },
                );
                completed.push({ ...result, recipient: userDisplayName(recipient) });
            } catch (generationError) {
                failures.push(
                    `${userDisplayName(recipient)}: ${generationError instanceof Error ? generationError.message : "generation failed"}`,
                );
            }
            setProgress((current) => ({ ...current, completed: current.completed + 1 }));
        }

        setResults(completed);
        const createdCount = completed.filter((result) => !result.alreadyIssued).length;
        const existingCount = completed.length - createdCount;
        const message = `${createdCount} certificate(s) uploaded${existingCount ? `; ${existingCount} existing file(s) reused` : ""}${failures.length ? `; ${failures.length} failed` : ""}.`;
        if (completed.length) {
            setNotice(message);
            onCompleted?.(message);
        }
        if (failures.length) setError(failures.slice(0, 3).join(" • "));
        setIsGenerating(false);
    }

    return (
        <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
            onMouseDown={(mouseEvent) => {
                if (mouseEvent.target === mouseEvent.currentTarget && !isGenerating) onClose();
            }}
        >
            <div role="dialog" aria-modal="true" aria-labelledby="generate-certificate-title" className="max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto rounded-[30px] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-8">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.22em] text-amber-600 dark:text-amber-300"><Award size={17} /> Certificate issuance</p>
                        <h2 id="generate-certificate-title" className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                            {target.kind === "user" ? `Generate for ${userDisplayName(target.user)}` : `Generate for ${target.sessionName}`}
                        </h2>
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Choose the registered event and template before generating. JPG files are saved privately in Supabase Storage.</p>
                    </div>
                    <button type="button" onClick={onClose} disabled={isGenerating} aria-label="Close certificate generator" className="rounded-xl border border-slate-200 p-2 text-slate-500 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400"><X size={18} /></button>
                </div>

                {error ? <div className="mt-5 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300"><CircleAlert size={16} className="mt-0.5 shrink-0" /> {error}</div> : null}
                {notice ? <div className="mt-5 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300"><CheckCircle2 size={16} /> {notice}</div> : null}

                {isLoading ? (
                    <div className="py-20 text-center text-slate-500 dark:text-slate-400"><LoaderCircle size={20} className="mr-2 inline animate-spin" /> Loading registered events and templates…</div>
                ) : (
                    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]">
                        <div className="space-y-5">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                    <span className="mb-2 flex items-center gap-2"><CalendarDays size={16} className="text-sky-600" /> Registered event</span>
                                    <select value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)} disabled={target.kind === "session" || !events.length || isGenerating} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-sky-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                                        {!events.length ? <option value="">No registered events</option> : null}
                                        {events.map((event) => <option key={event.id} value={event.id}>{event.event_name}</option>)}
                                    </select>
                                </label>
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                    <span className="mb-2 flex items-center gap-2"><Sparkles size={16} className="text-amber-600" /> Certificate template</span>
                                    <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} disabled={!templates.length || isGenerating} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-amber-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                                        {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                                    </select>
                                </label>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/70">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><UserRound size={16} className="text-sky-600" /> Recipients</p>
                                    <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-400/15 dark:text-sky-300">{recipients.length}</span>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {recipientSummary.map((name) => <span key={name} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{name}</span>)}
                                    {recipients.length > recipientSummary.length ? <span className="px-2 py-1 text-xs text-slate-400">+{recipients.length - recipientSummary.length} more</span> : null}
                                    {!recipients.length ? <span className="text-sm text-slate-400">No linked attendee profiles found.</span> : null}
                                </div>
                                {skippedRecipientCount ? <p className="mt-3 text-xs text-amber-600">{skippedRecipientCount} attendee record(s) without a linked profile were skipped.</p> : null}
                            </div>

                            {results.length ? (
                                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-400/20 dark:bg-emerald-400/5">
                                    <p className="font-semibold text-emerald-800 dark:text-emerald-200">Certificate files</p>
                                    <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                                        {results.map((result) => (
                                            <div key={result.certificate.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm dark:bg-slate-900">
                                                <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">{result.recipient} · {result.alreadyIssued ? "Existing" : "Uploaded"}</span>
                                                {result.downloadUrl ? <a href={result.downloadUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 font-semibold text-sky-700 dark:text-sky-300">Open <ExternalLink size={13} /></a> : null}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            <button type="button" onClick={generateAndUpload} disabled={isGenerating || !selectedEvent || !recipients.length} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-700 to-blue-800 px-5 py-4 font-semibold text-white shadow-lg shadow-blue-950/15 transition hover:from-sky-600 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                                {isGenerating ? <LoaderCircle size={18} className="animate-spin" /> : <Award size={18} />}
                                {isGenerating ? `Generating ${progress.completed}/${progress.total}…` : `Generate and upload ${recipients.length || ""} JPG certificate${recipients.length === 1 ? "" : "s"}`}
                            </button>
                        </div>

                        <div className="rounded-[24px] border border-slate-200 bg-slate-100 p-3 dark:border-slate-800 dark:bg-slate-950/70">
                            <p className="mb-3 px-1 text-sm font-semibold text-slate-900 dark:text-white">Selected certificate preview</p>
                            <CertificatePreview template={selectedTemplate} data={previewData} />
                            <p className="mt-3 px-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Issued files are stored under <span className="font-semibold">QMOStorage/certificates</span>. Existing active files for the same recipient and event are reused and audited.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
