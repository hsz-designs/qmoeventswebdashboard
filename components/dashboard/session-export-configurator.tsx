"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
    ArrowLeft,
    CheckCircle2,
    CircleAlert,
    Download,
    FileSpreadsheet,
    FileText,
    ListChecks,
    LoaderCircle,
    RotateCcw,
    Upload,
    X,
} from "lucide-react";
import {
    SESSION_ATTENDEE_EXPORT_COLUMNS,
    type SessionAttendeeExportFieldKey,
    type SessionAttendeeExportPreview,
} from "@/lib/session-attendee-export";
import { downloadAuthenticatedFile } from "@/lib/supabase/authenticated-download";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";

type ExportFormat = "csv" | "excel" | "word";
type SelectionState = Record<SessionAttendeeExportFieldKey, boolean>;
type LabelState = Record<SessionAttendeeExportFieldKey, string>;

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function initialSelection(): SelectionState {
    return Object.fromEntries(
        SESSION_ATTENDEE_EXPORT_COLUMNS.map((column) => [column.key, true]),
    ) as SelectionState;
}

function initialLabels(): LabelState {
    return Object.fromEntries(
        SESSION_ATTENDEE_EXPORT_COLUMNS.map((column) => [column.key, column.label]),
    ) as LabelState;
}

function isAuthenticationError(message: string) {
    const normalized = message.toLowerCase();
    return normalized.includes("sign in") || normalized.includes("session");
}

function formatName(format: ExportFormat) {
    if (format === "csv") return "CSV";
    if (format === "excel") return "Excel";
    return "Microsoft Word";
}

export function SessionExportConfigurator({
    eventId,
    sessionId,
}: {
    eventId: string;
    sessionId: string;
}) {
    const [preview, setPreview] = useState<SessionAttendeeExportPreview | null>(null);
    const [selected, setSelected] = useState<SelectionState>(initialSelection);
    const [labels, setLabels] = useState<LabelState>(initialLabels);
    const [format, setFormat] = useState<ExportFormat>("excel");
    const [headerImage, setHeaderImage] = useState<File | null>(null);
    const [footerImage, setFooterImage] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const endpoint = `/api/events/${eventId}/sessions/${sessionId}/attendees/export`;

    useEffect(() => {
        let active = true;

        authenticatedFetch<SessionAttendeeExportPreview>(endpoint)
            .then((response) => {
                if (active) setPreview(response);
            })
            .catch((loadError: unknown) => {
                if (active) {
                    setError(loadError instanceof Error ? loadError.message : "Unable to load export details.");
                }
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        return () => {
            active = false;
        };
    }, [endpoint]);

    const selectedColumns = useMemo(
        () => SESSION_ATTENDEE_EXPORT_COLUMNS.filter((column) => selected[column.key]),
        [selected],
    );

    function setAllFields(value: boolean) {
        setSelected(Object.fromEntries(
            SESSION_ATTENDEE_EXPORT_COLUMNS.map((column) => [column.key, value]),
        ) as SelectionState);
        setNotice(null);
    }

    function resetLabels() {
        setLabels(initialLabels());
        setNotice("Column labels reset to their defaults.");
    }

    function chooseImage(kind: "header" | "footer", file: File | null) {
        setError(null);
        setNotice(null);
        if (!file) return;

        if (!(["image/png", "image/jpeg"].includes(file.type))) {
            setError(`${kind === "header" ? "Header" : "Footer"} image must be a PNG or JPEG file.`);
            return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
            setError(`${kind === "header" ? "Header" : "Footer"} image must be 2 MB or smaller.`);
            return;
        }

        if (kind === "header") setHeaderImage(file);
        else setFooterImage(file);
    }

    async function exportReport() {
        setError(null);
        setNotice(null);

        if (!selectedColumns.length) {
            setError("Choose at least one field to include in the export.");
            return;
        }

        const fields = selectedColumns.map((column) => ({
            key: column.key,
            label: labels[column.key].trim(),
        }));
        if (fields.some((field) => !field.label || field.label.length > 80)) {
            setError("Every selected field needs a label of up to 80 characters.");
            return;
        }

        const formData = new FormData();
        formData.set("format", format);
        formData.set("fields", JSON.stringify(fields));
        if (format === "word") {
            if (headerImage) formData.set("headerImage", headerImage);
            if (footerImage) formData.set("footerImage", footerImage);
        }

        setIsExporting(true);
        try {
            await downloadAuthenticatedFile(endpoint, { method: "POST", body: formData });
            setNotice(`${formatName(format)} attendee report downloaded successfully.`);
        } catch (exportError) {
            setError(exportError instanceof Error ? exportError.message : "Unable to export attendees.");
        } finally {
            setIsExporting(false);
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href={`/dashboard/events/${eventId}/sessions`}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 transition hover:text-sky-500 dark:text-sky-300"
                >
                    <ArrowLeft size={16} /> Back to event sessions
                </Link>
                <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-sm font-medium uppercase tracking-[0.3em] text-amber-600 dark:text-amber-300">Attendee report setup</p>
                        <h1 className="mt-1 text-3xl font-semibold text-slate-900 dark:text-white">
                            {preview?.session.topic || (isLoading ? "Loading export…" : "Configure export")}
                        </h1>
                        <p className="mt-2 text-slate-600 dark:text-slate-400">
                            {preview
                                ? `${preview.event.name} · ${preview.rowCount} attendee record${preview.rowCount === 1 ? "" : "s"}`
                                : "Choose the report format, fields, and display labels before downloading."}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={exportReport}
                        disabled={isLoading || isExporting || !preview}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isExporting ? <LoaderCircle size={18} className="animate-spin" /> : <Download size={18} />}
                        {isExporting ? "Preparing download…" : `Export ${formatName(format)}`}
                    </button>
                </div>
            </div>

            {error ? (
                <div className="flex items-start justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300">
                    <span className="flex items-center gap-2"><CircleAlert size={16} className="shrink-0" /> {error}</span>
                    {isAuthenticationError(error) ? (
                        <Link href="/" className="shrink-0 font-semibold underline underline-offset-4">Sign in</Link>
                    ) : null}
                </div>
            ) : null}

            {notice ? (
                <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
                    <CheckCircle2 size={16} /> {notice}
                </div>
            ) : null}

            <section className="rounded-[28px] border border-slate-200 bg-white/85 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 sm:p-6">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Step 1</p>
                    <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">Choose a file format</h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">All formats use the fields and labels selected below.</p>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                    {([
                        { value: "csv" as const, name: "CSV", detail: "Comma-separated text", icon: FileText, accent: "sky" },
                        { value: "excel" as const, name: "Excel", detail: "Microsoft Excel workbook", icon: FileSpreadsheet, accent: "emerald" },
                        { value: "word" as const, name: "Microsoft Word", detail: "A4 document with optional images", icon: FileText, accent: "amber" },
                    ]).map((option) => {
                        const Icon = option.icon;
                        const active = format === option.value;
                        return (
                            <label
                                key={option.value}
                                className={`cursor-pointer rounded-2xl border p-4 transition ${active
                                    ? "border-sky-400 bg-sky-50 ring-2 ring-sky-100 dark:border-sky-400 dark:bg-sky-400/10 dark:ring-sky-400/10"
                                    : "border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950/70 dark:hover:border-slate-600"}`}
                            >
                                <input
                                    type="radio"
                                    name="export-format"
                                    value={option.value}
                                    checked={active}
                                    onChange={() => {
                                        setFormat(option.value);
                                        setError(null);
                                        setNotice(null);
                                    }}
                                    className="sr-only"
                                />
                                <span className="flex items-center gap-3">
                                    <span className="rounded-xl bg-white p-2 text-sky-700 shadow-sm dark:bg-slate-900 dark:text-sky-300"><Icon size={19} /></span>
                                    <span><span className="block font-semibold text-slate-900 dark:text-white">{option.name}</span><span className="mt-0.5 block text-sm text-slate-500 dark:text-slate-400">{option.detail}</span></span>
                                </span>
                            </label>
                        );
                    })}
                </div>
            </section>

            {format === "word" ? (
                <section className="rounded-[28px] border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-400/20 dark:bg-amber-400/[0.06] sm:p-6">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-300">Word branding</p>
                        <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">A4 header and footer images</h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Optional PNG or JPEG files, up to 2 MB each. Images are fitted proportionally on every A4 page.</p>
                    </div>
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                        {([
                            { kind: "header" as const, title: "Header image", file: headerImage },
                            { kind: "footer" as const, title: "Footer image", file: footerImage },
                        ]).map((item) => (
                            <div key={item.kind} className="rounded-2xl border border-amber-200 bg-white p-4 dark:border-amber-400/20 dark:bg-slate-900/70">
                                <p className="font-semibold text-slate-900 dark:text-white">{item.title}</p>
                                {item.file ? (
                                    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3 dark:bg-slate-950/70">
                                        <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-700 dark:text-slate-200">{item.file.name}</span><span className="text-xs text-slate-400">{(item.file.size / 1024).toFixed(0)} KB</span></span>
                                        <button
                                            type="button"
                                            onClick={() => item.kind === "header" ? setHeaderImage(null) : setFooterImage(null)}
                                            aria-label={`Remove ${item.title.toLowerCase()}`}
                                            className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-400/10 dark:hover:text-rose-300"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-amber-300 px-4 py-5 text-sm font-semibold text-amber-700 transition hover:bg-amber-50 dark:border-amber-400/30 dark:text-amber-300 dark:hover:bg-amber-400/10">
                                        <Upload size={17} /> Upload {item.kind} image
                                        <input
                                            type="file"
                                            accept="image/png,image/jpeg"
                                            className="sr-only"
                                            onClick={(inputEvent) => {
                                                inputEvent.currentTarget.value = "";
                                            }}
                                            onChange={(inputEvent) => chooseImage(item.kind, inputEvent.target.files?.[0] || null)}
                                        />
                                    </label>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            <section className="rounded-[28px] border border-slate-200 bg-white/85 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Step 2</p>
                        <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-white"><ListChecks size={20} className="text-sky-600 dark:text-sky-300" /> Select fields and labels</h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Renaming a label changes only the downloaded column heading—not stored data.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setAllFields(true)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">Select all</button>
                        <button type="button" onClick={() => setAllFields(false)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">Clear all</button>
                        <button type="button" onClick={resetLabels} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5"><RotateCcw size={14} /> Reset labels</button>
                    </div>
                </div>

                <div className="mt-5 grid gap-3 lg:grid-cols-2">
                    {SESSION_ATTENDEE_EXPORT_COLUMNS.map((column) => {
                        const isSelected = selected[column.key];
                        return (
                            <div
                                key={column.key}
                                className={`grid gap-3 rounded-2xl border p-4 transition sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:items-center ${isSelected
                                    ? "border-sky-200 bg-sky-50/60 dark:border-sky-400/20 dark:bg-sky-400/[0.06]"
                                    : "border-slate-200 bg-slate-50/70 opacity-70 dark:border-slate-800 dark:bg-slate-950/50"}`}
                            >
                                <label className="flex cursor-pointer items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(inputEvent) => {
                                            setSelected((current) => ({ ...current, [column.key]: inputEvent.target.checked }));
                                            setError(null);
                                            setNotice(null);
                                        }}
                                        className="h-4 w-4 rounded border-slate-300 accent-sky-600"
                                    />
                                    <span><span className="block text-sm font-semibold text-slate-900 dark:text-white">{column.label}</span><span className="mt-0.5 block font-mono text-[11px] text-slate-400">{column.key}</span></span>
                                </label>
                                <label className="block">
                                    <span className="sr-only">Export label for {column.label}</span>
                                    <input
                                        type="text"
                                        maxLength={80}
                                        disabled={!isSelected}
                                        value={labels[column.key]}
                                        onChange={(inputEvent) => {
                                            setLabels((current) => ({ ...current, [column.key]: inputEvent.target.value }));
                                            setError(null);
                                            setNotice(null);
                                        }}
                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-800"
                                    />
                                </label>
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white/85 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Step 3</p><h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">Preview selected columns</h2></div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Showing up to 5 of {preview?.rowCount ?? 0} records</p>
                </div>
                {isLoading ? (
                    <div className="px-6 py-14 text-center text-slate-500 dark:text-slate-400"><span className="inline-flex items-center gap-2"><LoaderCircle size={18} className="animate-spin" /> Loading preview…</span></div>
                ) : !selectedColumns.length ? (
                    <div className="px-6 py-14 text-center text-slate-500 dark:text-slate-400">Select at least one field to preview the report.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full whitespace-nowrap text-left text-sm">
                            <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-950/70 dark:text-slate-400">
                                <tr>{selectedColumns.map((column) => <th key={column.key} className="border-b border-slate-200 px-4 py-3 font-semibold dark:border-slate-800">{labels[column.key] || column.label}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                {preview?.sampleRows.length ? preview.sampleRows.map((row, rowIndex) => (
                                    <tr key={rowIndex}>
                                        {selectedColumns.map((column) => <td key={column.key} className="max-w-[260px] truncate px-4 py-3 text-slate-600 dark:text-slate-300" title={row[column.key] === null ? "" : String(row[column.key])}>{row[column.key] === null || row[column.key] === "" ? "—" : String(row[column.key])}</td>)}
                                    </tr>
                                )) : (
                                    <tr><td colSpan={selectedColumns.length} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">No attendee records yet. The export will contain column headings only.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={exportReport}
                    disabled={isLoading || isExporting || !preview}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isExporting ? <LoaderCircle size={18} className="animate-spin" /> : <Download size={18} />}
                    {isExporting ? "Preparing download…" : `Export ${formatName(format)}`}
                </button>
            </div>
        </div>
    );
}
