"use client";

import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import {
    Award,
    CalendarDays,
    Check,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    CloudUpload,
    Download,
    FileImage,
    FileText,
    ListPlus,
    LoaderCircle,
    PlusCircle,
    Search,
    Sparkles,
    Trash2,
    UsersRound,
} from "lucide-react";
import { CertificatePreview } from "@/components/dashboard/certificate-preview";
import { CertificateTemplateEditor } from "@/components/dashboard/certificate-template-editor";
import {
    SAMPLE_CERTIFICATE_DATA,
    createBlankCertificateTemplate,
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
import {
    canvasToBlob,
    downloadBlob,
    renderCertificateCanvas,
} from "@/lib/certificate-renderer";
import type { EventRecord } from "@/lib/events";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";
import { type UserRecord, userDisplayName } from "@/lib/users";

const PAGE_SIZE = 25;
const DEFAULT_TEMPLATES = createDefaultCertificateTemplates();
const DEFAULT_TEMPLATE = DEFAULT_TEMPLATES[0];
const DEFAULT_TEMPLATE_IDS = new Set(DEFAULT_TEMPLATES.map((template) => template.id));
const issuer = "National University QMO Manila";
const MAX_STORAGE_CERTIFICATES = 200;

type AttendanceFilter = "all" | "attended" | "registered" | "no_record";
type GenerationMode = "users" | "manual";

type ManualRecipient = {
    id: string;
    name: string;
};

const eventDateFormatter = new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
});

function formatEventDate(event: EventRecord) {
    const startsAt = new Date(event.start_datetime);
    const endsAt = new Date(event.end_datetime);
    return startsAt.toDateString() === endsAt.toDateString()
        ? eventDateFormatter.format(startsAt)
        : `${eventDateFormatter.format(startsAt)} – ${eventDateFormatter.format(endsAt)}`;
}

function certificateDataForName(name: string, event: EventRecord): CertificateBindingData {
    return {
        recipientName: name,
        eventName: event.event_name,
        eventDate: formatEventDate(event),
        issuer,
    };
}

export function CertificatesManager() {
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [events, setEvents] = useState<EventRecord[]>([]);
    const [templates, setTemplates] = useState<CertificateTemplate[]>(DEFAULT_TEMPLATES);
    const [selectedEventId, setSelectedEventId] = useState("");
    const [selectedTemplateId, setSelectedTemplateId] = useState(DEFAULT_TEMPLATE.id);
    const [attendedAuthIds, setAttendedAuthIds] = useState<Set<string>>(new Set());
    const [registeredAuthIds, setRegisteredAuthIds] = useState<Set<string>>(new Set());
    const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
    const [generationMode, setGenerationMode] = useState<GenerationMode>("users");
    const [manualNameInput, setManualNameInput] = useState("");
    const [manualRecipients, setManualRecipients] = useState<ManualRecipient[]>([]);
    const [query, setQuery] = useState("");
    const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>("all");
    const [page, setPage] = useState(1);
    const [outputFormat, setOutputFormat] = useState<"png" | "pdf">("pdf");
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSavingJpg, setIsSavingJpg] = useState(false);
    const [storageProgress, setStorageProgress] = useState({ completed: 0, total: 0 });
    const [editorTemplate, setEditorTemplate] = useState<CertificateTemplate | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        async function loadCertificateData() {
            setIsLoading(true);
            setError(null);
            const browserTemplates = readBrowserCertificateTemplates();
            setTemplates(mergeCertificateTemplates(DEFAULT_TEMPLATES, browserTemplates));
            try {
                const [usersResponse, eventsResponse] = await Promise.all([
                    authenticatedFetch<{ users: UserRecord[] }>("/api/users"),
                    authenticatedFetch<{ events: EventRecord[] }>("/api/events"),
                ]);
                if (!active) return;

                setUsers(usersResponse.users);
                setEvents(eventsResponse.events);
                const preferredEvent = eventsResponse.events.find((event) => event.status === "completed")
                    || eventsResponse.events[0];
                if (preferredEvent) setSelectedEventId(String(preferredEvent.id));

                try {
                    const templateResponse = await authenticatedFetch<CertificateTemplatesResponse>(
                        "/api/certificates/templates",
                    );
                    if (active) {
                        setTemplates(mergeCertificateTemplates(
                            DEFAULT_TEMPLATES,
                            templateResponse.templates,
                            browserTemplates,
                        ));
                    }
                } catch {
                    if (active) {
                        setTemplates(mergeCertificateTemplates(DEFAULT_TEMPLATES, browserTemplates));
                    }
                }
            } catch (loadError) {
                if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load certificate data.");
            } finally {
                if (active) setIsLoading(false);
            }
        }

        void loadCertificateData();
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!selectedEventId) return;

        let active = true;
        async function loadAttendance() {
            setIsLoadingAttendance(true);
            setSelectedUserIds(new Set());
            setAttendedAuthIds(new Set());
            setRegisteredAuthIds(new Set());
            setNotice(null);
            setError(null);

            try {
                const response = await authenticatedFetch<{
                    attendedUserIds: string[];
                    registeredUserIds: string[];
                }>(
                    `/api/certificates/eligibility?eventId=${selectedEventId}`,
                );
                if (!active) return;
                setAttendedAuthIds(new Set(response.attendedUserIds));
                setRegisteredAuthIds(new Set(response.registeredUserIds));
            } catch (attendanceError) {
                if (active) setError(attendanceError instanceof Error ? attendanceError.message : "Unable to load event attendance.");
            } finally {
                if (active) setIsLoadingAttendance(false);
            }
        }

        void loadAttendance();

        return () => {
            active = false;
        };
    }, [selectedEventId]);

    const selectedEvent = events.find((event) => String(event.id) === selectedEventId) || null;
    const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || DEFAULT_TEMPLATE;
    const attendedUsers = useMemo(
        () => users.filter((user) => Boolean(user.auth_user_id && attendedAuthIds.has(user.auth_user_id))),
        [attendedAuthIds, users],
    );
    const registeredUsers = useMemo(
        () => users.filter((user) => Boolean(user.auth_user_id && registeredAuthIds.has(user.auth_user_id))),
        [registeredAuthIds, users],
    );
    const noRecordUsers = useMemo(
        () => users.filter((user) => !user.auth_user_id || (
            !attendedAuthIds.has(user.auth_user_id) && !registeredAuthIds.has(user.auth_user_id)
        )),
        [attendedAuthIds, registeredAuthIds, users],
    );
    const normalizedQuery = query.trim().toLowerCase();
    const statusFilteredUsers = attendanceFilter === "all"
        ? users
        : users.filter((user) => attendanceStatus(user) === attendanceFilter);
    const filteredUsers = normalizedQuery
        ? statusFilteredUsers.filter((user) =>
            [userDisplayName(user), user.email, user.username]
                .filter(Boolean)
                .some((value) => value?.toLowerCase().includes(normalizedQuery)),
        )
        : statusFilteredUsers;
    const pageCount = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount);
    const visibleUsers = filteredUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    const validManualRecipients = manualRecipients.filter((recipient) => recipient.name.trim());
    const generationCount = generationMode === "manual" ? validManualRecipients.length : selectedUserIds.size;
    const previewUser = users.find((user) => selectedUserIds.has(user.id)) || users[0] || null;
    const previewRecipientName = generationMode === "manual"
        ? validManualRecipients[0]?.name.trim()
        : previewUser ? userDisplayName(previewUser) : null;
    const previewData = previewRecipientName && selectedEvent
        ? certificateDataForName(previewRecipientName, selectedEvent)
        : {
            ...SAMPLE_CERTIFICATE_DATA,
            eventName: selectedEvent?.event_name || SAMPLE_CERTIFICATE_DATA.eventName,
            eventDate: selectedEvent ? formatEventDate(selectedEvent) : SAMPLE_CERTIFICATE_DATA.eventDate,
        };

    function attendanceStatus(user: UserRecord): Exclude<AttendanceFilter, "all"> {
        if (user.auth_user_id && attendedAuthIds.has(user.auth_user_id)) return "attended";
        if (user.auth_user_id && registeredAuthIds.has(user.auth_user_id)) return "registered";
        return "no_record";
    }

    function toggleUser(user: UserRecord) {
        setSelectedUserIds((current) => {
            const next = new Set(current);
            if (next.has(user.id)) next.delete(user.id);
            else next.add(user.id);
            return next;
        });
    }

    function selectAllFiltered() {
        const filteredIds = filteredUsers.map((user) => user.id);
        const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedUserIds.has(id));
        setSelectedUserIds((current) => {
            const next = new Set(current);
            filteredIds.forEach((id) => allFilteredSelected ? next.delete(id) : next.add(id));
            return next;
        });
    }

    function addManualRecipients() {
        const enteredNames = manualNameInput
            .split(/\r?\n/)
            .map((name) => name.trim())
            .filter(Boolean);
        if (!enteredNames.length) {
            setError("Enter at least one recipient name.");
            return;
        }

        setManualRecipients((current) => {
            const existingNames = new Set(current.map((recipient) => recipient.name.trim().toLowerCase()));
            const additions = enteredNames
                .filter((name) => {
                    const normalized = name.toLowerCase();
                    if (existingNames.has(normalized)) return false;
                    existingNames.add(normalized);
                    return true;
                })
                .map((name) => ({ id: crypto.randomUUID(), name }));
            return [...current, ...additions];
        });
        setManualNameInput("");
        setError(null);
        setNotice(null);
    }

    function updateManualRecipient(id: string, name: string) {
        setManualRecipients((current) => current.map((recipient) =>
            recipient.id === id ? { ...recipient, name } : recipient,
        ));
    }

    function removeManualRecipient(id: string) {
        setManualRecipients((current) => current.filter((recipient) => recipient.id !== id));
    }

    async function generateCertificates() {
        if (!selectedEvent) {
            setError("Choose an event first.");
            return;
        }

        const recipients = generationMode === "manual"
            ? validManualRecipients.map((recipient) => ({
                name: recipient.name.trim(),
            }))
            : users
                .filter((user) => selectedUserIds.has(user.id))
                .map((user) => ({ name: userDisplayName(user) }));
        if (!recipients.length) {
            setError(generationMode === "manual"
                ? "Add at least one manual recipient name."
                : "Select at least one user for certificate generation.");
            return;
        }

        setError(null);
        setNotice(null);
        setIsGenerating(true);

        try {
            if (outputFormat === "pdf") {
                const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
                for (let index = 0; index < recipients.length; index += 1) {
                    const recipient = recipients[index];
                    const canvas = await renderCertificateCanvas(
                        selectedTemplate,
                        certificateDataForName(recipient.name, selectedEvent),
                    );
                    if (index > 0) pdf.addPage("a4", "landscape");
                    pdf.addImage(canvas.toDataURL("image/jpeg", 0.96), "JPEG", 0, 0, 297, 210, undefined, "FAST");
                }
                pdf.save(`${safeCertificateFilename(selectedEvent.event_name)}-certificates-${recipients.length}.pdf`);
            } else {
                for (const recipient of recipients) {
                    const canvas = await renderCertificateCanvas(
                        selectedTemplate,
                        certificateDataForName(recipient.name, selectedEvent),
                    );
                    const blob = await canvasToBlob(canvas, "image/png");
                    const filename = [
                        safeCertificateFilename(recipient.name),
                        safeCertificateFilename(selectedEvent.event_name),
                        "certificate.png",
                    ].join("-");
                    downloadBlob(blob, filename);
                }
            }

            setNotice(
                outputFormat === "pdf"
                    ? `Created one A4 landscape PDF with ${recipients.length} certificate page${recipients.length === 1 ? "" : "s"}.`
                    : `Created ${recipients.length} named PNG certificate${recipients.length === 1 ? "" : "s"}.`,
            );
        } catch (generationError) {
            setError(generationError instanceof Error ? generationError.message : "Unable to generate the certificates.");
        } finally {
            setIsGenerating(false);
        }
    }

    async function generateAndSaveJpgCertificates() {
        if (!selectedEvent) {
            setError("Choose an event first.");
            return;
        }
        if (generationMode !== "users") {
            setError("Supabase certificate records require linked user profiles. Switch to Users and attendance.");
            return;
        }

        const selectedUsers = users.filter((user) => selectedUserIds.has(user.id));
        if (!selectedUsers.length) {
            setError("Select at least one registered user to save a certificate.");
            return;
        }
        const ineligibleUsers = selectedUsers.filter((user) => !user.auth_user_id || (
            !attendedAuthIds.has(user.auth_user_id) && !registeredAuthIds.has(user.auth_user_id)
        ));
        if (ineligibleUsers.length) {
            setError(`${ineligibleUsers.length} selected user${ineligibleUsers.length === 1 ? " is" : "s are"} not registered for this event. Deselect users marked No record before saving.`);
            return;
        }
        if (selectedUsers.length > MAX_STORAGE_CERTIFICATES) {
            setError(`Save certificates in batches of ${MAX_STORAGE_CERTIFICATES} users or fewer.`);
            return;
        }

        setError(null);
        setNotice(null);
        setIsSavingJpg(true);
        setStorageProgress({ completed: 0, total: selectedUsers.length });

        const completed: CertificateIssueResponse[] = [];
        const failures: string[] = [];
        for (const recipient of selectedUsers) {
            try {
                const canvas = await renderCertificateCanvas(
                    selectedTemplate,
                    certificateDataForName(userDisplayName(recipient), selectedEvent),
                );
                const blob = await canvasToBlob(canvas, "image/jpeg", 0.94);
                const formData = new FormData();
                formData.set("userId", String(recipient.id));
                formData.set("eventId", String(selectedEvent.id));
                formData.set("template", JSON.stringify(selectedTemplate));
                formData.set(
                    "certificate",
                    blob,
                    `${safeCertificateFilename(userDisplayName(recipient))}-${safeCertificateFilename(selectedEvent.event_name)}.jpg`,
                );
                completed.push(await authenticatedFetch<CertificateIssueResponse>(
                    "/api/certificates/issue",
                    { method: "POST", body: formData },
                ));
            } catch (saveError) {
                failures.push(`${userDisplayName(recipient)}: ${saveError instanceof Error ? saveError.message : "upload failed"}`);
            }
            setStorageProgress((current) => ({ ...current, completed: current.completed + 1 }));
        }

        const uploadedCount = completed.filter((result) => !result.alreadyIssued).length;
        const reusedCount = completed.length - uploadedCount;
        const linkedAttendanceCount = completed.reduce(
            (total, result) => total + result.attendanceRecordsUpdated,
            0,
        );
        if (completed.length) {
            setNotice(`${uploadedCount} JPG certificate${uploadedCount === 1 ? "" : "s"} saved to QMOStorage/certificates${reusedCount ? `; ${reusedCount} existing JPG file${reusedCount === 1 ? "" : "s"} reused` : ""}. ${linkedAttendanceCount} attendee session record${linkedAttendanceCount === 1 ? "" : "s"} linked to the certificate URL.`);
        }
        if (failures.length) setError(failures.slice(0, 3).join(" • "));
        setIsSavingJpg(false);
    }

    return (
        <div className="space-y-7">
            <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-600 dark:text-amber-300">Recognition studio</p>
                    <h1 className="mt-1 text-3xl font-semibold text-slate-900 dark:text-white">Certificates</h1>
                    <p className="mt-2 max-w-3xl text-slate-600 dark:text-slate-400">Create polished National University QMO Manila certificates as print-ready PDF or PNG downloads, or save registered users’ JPG certificates to Supabase with an audit trail.</p>
                </div>
                <button type="button" onClick={() => setEditorTemplate(createBlankCertificateTemplate())} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-700 px-5 py-3 font-semibold text-white shadow-lg shadow-sky-900/10 transition hover:bg-sky-600">
                    <PlusCircle size={18} /> Create new template
                </button>
            </header>

            {error ? (
                <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300"><CircleAlert size={16} /> {error}</div>
            ) : null}
            {notice ? (
                <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300"><Check size={16} /> {notice}</div>
            ) : null}

            <section className="grid gap-4 md:grid-cols-3">
                <StatCard icon={UsersRound} label="All users" value={users.length} tone="sky" />
                <StatCard icon={Award} label="Attended selected event" value={attendedUsers.length} tone="amber" />
                <StatCard icon={Sparkles} label={generationMode === "manual" ? "Manual names to generate" : "Selected to generate"} value={generationCount} tone="violet" />
            </section>

            <section className="rounded-[26px] border border-slate-200 bg-white/85 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="grid gap-4 lg:grid-cols-3">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        <span className="mb-2 flex items-center gap-2"><CalendarDays size={16} className="text-sky-600" /> Certificate event</span>
                        <select value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)} disabled={isLoading || !events.length} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-sky-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                            {!events.length ? <option value="">No events available</option> : null}
                            {events.map((event) => <option key={event.id} value={event.id}>{event.event_name}</option>)}
                        </select>
                    </label>
                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        <span className="mb-2 flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2"><Sparkles size={16} className="text-amber-600" /> Certificate template</span>
                            <button type="button" onClick={() => setEditorTemplate(selectedTemplate)} className="text-xs font-semibold text-sky-700 hover:text-sky-600 dark:text-sky-300">Edit all elements</button>
                        </span>
                        <select aria-label="Certificate template" value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-amber-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                        </select>
                    </div>
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        <span className="mb-2 flex items-center gap-2">{outputFormat === "pdf" ? <FileText size={16} className="text-rose-600" /> : <FileImage size={16} className="text-emerald-600" />} Output file</span>
                        <select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as "png" | "pdf")} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                            <option value="pdf">PDF · A4 landscape, multi-page</option>
                            <option value="png">PNG · individual high-resolution files</option>
                        </select>
                    </label>
                </div>
            </section>

            <section className="space-y-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="font-semibold text-slate-900 dark:text-white">Premium default collection</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Choose one of three professionally composed blue-and-gold foundations.</p>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-300">3 built-in templates</span>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                    {DEFAULT_TEMPLATES.map((template) => {
                        const active = selectedTemplateId === template.id;
                        return (
                            <article
                                key={template.id}
                                className={`overflow-hidden rounded-[22px] border p-2 text-left transition ${active ? "border-sky-500 bg-sky-50 shadow-lg shadow-sky-900/10 ring-2 ring-sky-500/20 dark:bg-sky-400/10" : "border-slate-200 bg-white/80 hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/70"}`}
                            >
                                <button type="button" onClick={() => setSelectedTemplateId(template.id)} aria-pressed={active} className="block w-full overflow-hidden rounded-[14px] text-left">
                                    <CertificatePreview template={template} data={previewData} />
                                    <span className="sr-only">Use {template.name}</span>
                                </button>
                                <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-3">
                                    <span>
                                        <span className="block text-sm font-semibold text-slate-900 dark:text-white">{template.name}</span>
                                        <span className="mt-0.5 block text-xs capitalize text-slate-500 dark:text-slate-400">{template.design} composition</span>
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <button type="button" onClick={() => setEditorTemplate(template)} className="rounded-lg border border-sky-200 px-2.5 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 dark:border-sky-400/25 dark:text-sky-300 dark:hover:bg-sky-400/10">Edit</button>
                                        <span className={`flex h-6 w-6 items-center justify-center rounded-full ${active ? "bg-sky-700 text-white" : "border border-slate-300 text-transparent dark:border-slate-600"}`}><Check size={14} /></span>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            </section>

            <section className="rounded-[22px] border border-slate-200 bg-white/80 p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="grid gap-2 sm:grid-cols-2" role="tablist" aria-label="Certificate recipient source">
                    <button type="button" role="tab" aria-selected={generationMode === "users"} onClick={() => { setGenerationMode("users"); setError(null); setNotice(null); }} className={`rounded-2xl px-5 py-3 text-sm font-semibold transition ${generationMode === "users" ? "bg-sky-700 text-white shadow-md shadow-sky-900/10" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
                        <UsersRound size={17} className="mr-2 inline" /> Users and attendance
                    </button>
                    <button type="button" role="tab" aria-selected={generationMode === "manual"} onClick={() => { setGenerationMode("manual"); setError(null); setNotice(null); }} className={`rounded-2xl px-5 py-3 text-sm font-semibold transition ${generationMode === "manual" ? "bg-sky-700 text-white shadow-md shadow-sky-900/10" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
                        <ListPlus size={17} className="mr-2 inline" /> Manually entered names
                    </button>
                </div>
            </section>

            <section className="grid gap-6 2xl:grid-cols-[minmax(0,1.1fr)_minmax(460px,0.9fr)]">
                {generationMode === "users" ? (
                    <div role="tabpanel" className="overflow-hidden rounded-[26px] border border-slate-200 bg-white/85 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="space-y-3 border-b border-slate-200 p-4 dark:border-slate-800">
                        <div className="flex flex-wrap gap-2">
                            {([
                                ["all", "All users", users.length],
                                ["attended", "Attended", attendedUsers.length],
                                ["registered", "Registered", registeredUsers.length],
                                ["no_record", "No record", noRecordUsers.length],
                            ] as const).map(([value, label, count]) => (
                                <button key={value} type="button" onClick={() => { setAttendanceFilter(value); setPage(1); }} aria-pressed={attendanceFilter === value} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${attendanceFilter === value ? "bg-sky-700 text-white shadow-sm" : "border border-slate-200 bg-slate-50 text-slate-600 hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"}`}>
                                    {label} <span className="ml-1 opacity-75">{count}</span>
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <label className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                                <Search size={16} />
                                <span className="sr-only">Search users</span>
                                <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search users in this filter" className="w-full bg-transparent text-sm text-slate-900 outline-none dark:text-white" />
                            </label>
                            <button type="button" onClick={selectAllFiltered} disabled={!filteredUsers.length || isLoadingAttendance} className="rounded-xl border border-sky-200 px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 disabled:opacity-40 dark:border-sky-400/25 dark:text-sky-300 dark:hover:bg-sky-400/10">
                                {filteredUsers.length > 0 && filteredUsers.every((user) => selectedUserIds.has(user.id)) ? "Clear filtered" : "Select filtered"}
                            </button>
                        </div>
                        </div>

                        <div className="overflow-x-auto">
                        <table className="w-full min-w-[700px] text-left">
                            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-400">
                                <tr>
                                    <th className="w-16 px-5 py-4 font-semibold">Select</th>
                                    <th className="px-5 py-4 font-semibold">User</th>
                                    <th className="px-5 py-4 font-semibold">Email</th>
                                    <th className="px-5 py-4 font-semibold">Selected event</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                {isLoading ? (
                                    <tr><td colSpan={4} className="px-5 py-14 text-center text-slate-500"><LoaderCircle size={18} className="mr-2 inline animate-spin" /> Loading users…</td></tr>
                                ) : visibleUsers.length ? visibleUsers.map((user) => {
                                    const status = attendanceStatus(user);
                                    const selected = selectedUserIds.has(user.id);
                                    return (
                                        <tr key={user.id} className="cursor-pointer transition hover:bg-sky-50/60 dark:hover:bg-sky-400/[0.04]" onClick={() => toggleUser(user)}>
                                            <td className="px-5 py-4">
                                                <input type="checkbox" checked={selected} disabled={isLoadingAttendance} onChange={() => toggleUser(user)} onClick={(event) => event.stopPropagation()} aria-label={`Select ${userDisplayName(user)}`} className="h-4 w-4 accent-sky-700" />
                                            </td>
                                            <td className="px-5 py-4">
                                                <p className="font-semibold text-slate-900 dark:text-white">{userDisplayName(user)}</p>
                                                <p className="mt-1 text-xs text-slate-400">User #{user.id}</p>
                                            </td>
                                            <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">{user.email}</td>
                                            <td className="px-5 py-4">
                                                {isLoadingAttendance ? (
                                                    <span className="inline-flex items-center gap-2 text-sm text-slate-400"><LoaderCircle size={14} className="animate-spin" /> Checking…</span>
                                                ) : status === "attended" ? (
                                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"><Check size={13} /> Attended</span>
                                                ) : status === "registered" ? (
                                                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">Registered</span>
                                                ) : (
                                                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">No record</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr><td colSpan={4} className="px-5 py-14 text-center text-slate-500">No users match this filter or search.</td></tr>
                                )}
                            </tbody>
                        </table>
                        </div>

                        {!isLoading && filteredUsers.length ? (
                            <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                <span>Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length}</span>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={currentPage === 1} aria-label="Previous users" className="rounded-xl border border-slate-200 p-2 disabled:opacity-40 dark:border-slate-700"><ChevronLeft size={16} /></button>
                                    <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={currentPage === pageCount} aria-label="Next users" className="rounded-xl border border-slate-200 p-2 disabled:opacity-40 dark:border-slate-700"><ChevronRight size={16} /></button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <div role="tabpanel" className="overflow-hidden rounded-[26px] border border-slate-200 bg-white/85 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="border-b border-slate-200 p-5 dark:border-slate-800">
                            <div className="flex items-start gap-3">
                                <div className="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300"><ListPlus size={20} /></div>
                                <div>
                                    <h2 className="font-semibold text-slate-900 dark:text-white">Manual certificate recipients</h2>
                                    <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">Enter one complete name per line. Every name in this list will receive a certificate.</p>
                                </div>
                            </div>
                            <label className="mt-4 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                                Recipient names
                                <textarea value={manualNameInput} onChange={(event) => setManualNameInput(event.target.value)} onKeyDown={(event) => {
                                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") addManualRecipients();
                                }} rows={5} placeholder={"Maria Santos\nJuan Dela Cruz\nAngela Reyes"} className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                            </label>
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <span className="text-xs text-slate-400">Tip: press Ctrl/⌘ + Enter to add the names.</span>
                                <button type="button" onClick={addManualRecipients} disabled={!manualNameInput.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"><PlusCircle size={16} /> Add names</button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/60">
                            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Certificate name list · {manualRecipients.length}</span>
                            <button type="button" onClick={() => setManualRecipients([])} disabled={!manualRecipients.length} className="text-xs font-semibold text-rose-600 hover:text-rose-500 disabled:opacity-40 dark:text-rose-300">Delete all</button>
                        </div>

                        <div className="max-h-[540px] divide-y divide-slate-200 overflow-y-auto dark:divide-slate-800">
                            {manualRecipients.length ? manualRecipients.map((recipient, index) => (
                                <div key={recipient.id} className="flex items-center gap-3 px-5 py-3">
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{index + 1}</span>
                                    <label className="min-w-0 flex-1">
                                        <span className="sr-only">Recipient {index + 1} name</span>
                                        <input value={recipient.name} onChange={(event) => updateManualRecipient(recipient.id, event.target.value)} maxLength={200} className="w-full rounded-xl border border-transparent bg-transparent px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition hover:border-slate-200 focus:border-sky-500 focus:bg-white dark:text-white dark:hover:border-slate-700 dark:focus:bg-slate-950" />
                                    </label>
                                    <button type="button" onClick={() => removeManualRecipient(recipient.id)} aria-label={`Delete ${recipient.name || `recipient ${index + 1}`}`} className="rounded-xl p-2.5 text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-400/10"><Trash2 size={17} /></button>
                                </div>
                            )) : (
                                <div className="px-5 py-16 text-center">
                                    <ListPlus size={28} className="mx-auto text-slate-300 dark:text-slate-600" />
                                    <p className="mt-3 font-semibold text-slate-700 dark:text-slate-200">No manual names yet</p>
                                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Add names above to prepare certificates.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                    <div className="rounded-[26px] border border-slate-200 bg-slate-100 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="mb-3 flex items-center justify-between gap-3 px-1">
                            <div>
                                <p className="font-semibold text-slate-900 dark:text-white">Live certificate preview</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">A4 landscape · 3508 × 2480 image render</p>
                            </div>
                            <Award size={22} className="text-amber-600" />
                        </div>
                        <CertificatePreview template={selectedTemplate} data={previewData} />
                    </div>
                    <button type="button" onClick={generateCertificates} disabled={isGenerating || isSavingJpg || !generationCount || !selectedEvent} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-700 to-blue-800 px-5 py-4 font-semibold text-white shadow-lg shadow-blue-950/15 transition hover:from-sky-600 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                        {isGenerating ? <LoaderCircle size={18} className="animate-spin" /> : <Download size={18} />}
                        {isGenerating ? "Rendering certificates…" : `Generate ${generationCount || ""} ${outputFormat.toUpperCase()} certificate${generationCount === 1 ? "" : "s"}`}
                    </button>
                    <button type="button" onClick={generateAndSaveJpgCertificates} disabled={isGenerating || isSavingJpg || generationMode !== "users" || !generationCount || !selectedEvent} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 font-semibold text-amber-800 shadow-sm transition hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200 dark:hover:bg-amber-400/15">
                        {isSavingJpg ? <LoaderCircle size={18} className="animate-spin" /> : <CloudUpload size={18} />}
                        {isSavingJpg ? `Saving ${storageProgress.completed}/${storageProgress.total} JPG files…` : `Generate JPG and save ${generationCount || ""} to Supabase`}
                    </button>
                    <p className="text-center text-xs leading-5 text-slate-500 dark:text-slate-400">{generationMode === "manual" ? "Manual names can be downloaded, but Supabase records require linked user profiles." : "Downloads may include any selected user. Supabase saving is limited to users registered for the selected event and creates an issuance audit trail."} Files use the recipient and event names without spaces.</p>
                </div>
            </section>

            {editorTemplate ? (
                <CertificateTemplateEditor
                    baseTemplate={editorTemplate}
                    onClose={() => setEditorTemplate(null)}
                    onSaved={(template, storedInBrowser) => {
                        setTemplates((current) => mergeCertificateTemplates(
                            DEFAULT_TEMPLATES,
                            [template],
                            current.filter((item) => !DEFAULT_TEMPLATE_IDS.has(item.id)),
                        ));
                        setSelectedTemplateId(template.id);
                        setEditorTemplate(null);
                        setNotice(storedInBrowser
                            ? `${template.name} was saved in this browser and is ready to use for other events.`
                            : `${template.name} was saved and is ready to use for other events.`);
                    }}
                />
            ) : null}
        </div>
    );
}

function StatCard({
    icon: Icon,
    label,
    value,
    tone,
}: {
    icon: typeof Award;
    label: string;
    value: number;
    tone: "sky" | "amber" | "violet";
}) {
    const tones = {
        sky: "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
        amber: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
        violet: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
    };

    return (
        <article className="flex items-center gap-4 rounded-[24px] border border-slate-200 bg-white/85 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className={`rounded-2xl p-3 ${tones[tone]}`}><Icon size={21} /></div>
            <div>
                <p className="text-2xl font-semibold text-slate-900 dark:text-white">{value}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
            </div>
        </article>
    );
}
