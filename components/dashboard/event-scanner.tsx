"use client";

import type { IScannerControls } from "@zxing/browser";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
    ArrowLeft,
    BadgeCheck,
    Camera,
    CameraOff,
    CheckCircle2,
    CircleAlert,
    CircleCheckBig,
    Clock3,
    Coffee,
    History,
    Keyboard,
    LoaderCircle,
    LogIn,
    ScanLine,
    ScanQrCode,
    ShieldCheck,
    UserRound,
    UsersRound,
} from "lucide-react";
import {
    ATTENDANCE_SCAN_ACTIONS,
    type AttendanceScanAction,
    type EventScannerActivity,
    type EventScannerResponse,
    type EventScanMutationResponse,
} from "@/lib/event-scanner";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";
import { userDisplayName } from "@/lib/users";

type CameraState = "idle" | "starting" | "active" | "error";

type ScanFeedback = {
    kind: "success" | "error";
    title: string;
    message: string;
    activity?: EventScannerActivity;
};

const eventDateFormatter = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
});

const scanTimeFormatter = new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
});

const actionPresentation = {
    login: {
        icon: LogIn,
        active: "border-emerald-400 bg-emerald-50 text-emerald-800 shadow-[0_12px_35px_-18px_rgba(16,185,129,0.75)] dark:border-emerald-400/60 dark:bg-emerald-400/15 dark:text-emerald-200",
        iconClasses: "bg-emerald-500 text-white",
    },
    break: {
        icon: Coffee,
        active: "border-amber-400 bg-amber-50 text-amber-800 shadow-[0_12px_35px_-18px_rgba(245,158,11,0.75)] dark:border-amber-400/60 dark:bg-amber-400/15 dark:text-amber-200",
        iconClasses: "bg-amber-500 text-white",
    },
    complete: {
        icon: CircleCheckBig,
        active: "border-sky-400 bg-sky-50 text-sky-800 shadow-[0_12px_35px_-18px_rgba(14,165,233,0.75)] dark:border-sky-400/60 dark:bg-sky-400/15 dark:text-sky-200",
        iconClasses: "bg-sky-600 text-white",
    },
} as const;

function activityClasses(action: AttendanceScanAction) {
    switch (action) {
        case "login":
            return "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300";
        case "break":
            return "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300";
        default:
            return "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300";
    }
}

export function EventScanner({ eventId }: { eventId: string }) {
    const [data, setData] = useState<EventScannerResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [pageError, setPageError] = useState<string | null>(null);
    const [selectedAction, setSelectedAction] = useState<AttendanceScanAction>("login");
    const [cameraState, setCameraState] = useState<CameraState>("idle");
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [manualQrCode, setManualQrCode] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const controlsRef = useRef<IScannerControls | null>(null);
    const isMountedRef = useRef(true);
    const processingRef = useRef(false);
    const actionRef = useRef<AttendanceScanAction>("login");
    const lastCameraReadRef = useRef({ value: "", time: 0 });

    useEffect(() => {
        let active = true;
        authenticatedFetch<EventScannerResponse>(`/api/events/${eventId}/scan`)
            .then((response) => {
                if (active) setData(response);
            })
            .catch((loadError: unknown) => {
                if (active) {
                    setPageError(loadError instanceof Error ? loadError.message : "Unable to prepare the event scanner.");
                }
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        return () => {
            active = false;
        };
    }, [eventId]);

    const submitScan = useCallback(async (qrCode: string, source: "camera" | "manual") => {
        const normalizedQrCode = qrCode.trim();
        if (!normalizedQrCode || processingRef.current) return;

        if (source === "camera") {
            const now = Date.now();
            const lastRead = lastCameraReadRef.current;
            if (lastRead.value === normalizedQrCode && now - lastRead.time < 3000) return;
            lastCameraReadRef.current = { value: normalizedQrCode, time: now };
        }

        processingRef.current = true;
        setIsProcessing(true);
        setFeedback(null);
        try {
            const response = await authenticatedFetch<EventScanMutationResponse>(
                `/api/events/${eventId}/scan`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        qrCode: normalizedQrCode,
                        action: actionRef.current,
                    }),
                },
            );
            setData((current) => current
                ? {
                    ...current,
                    totals: response.totals,
                    recentActivity: [
                        response.activity,
                        ...current.recentActivity.filter((item) => item.id !== response.activity.id),
                    ].slice(0, 12),
                }
                : current,
            );
            setFeedback({
                kind: "success",
                title: ATTENDANCE_SCAN_ACTIONS[response.activity.action].shortLabel,
                message: `${userDisplayName(response.activity.user)} was accepted for ${data?.event.event_name || "this event"}.`,
                activity: response.activity,
            });
            setManualQrCode("");
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                navigator.vibrate(80);
            }
        } catch (scanError) {
            setFeedback({
                kind: "error",
                title: "Scan not accepted",
                message: scanError instanceof Error ? scanError.message : "Unable to record this scan.",
            });
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                navigator.vibrate([90, 60, 90]);
            }
        } finally {
            processingRef.current = false;
            setIsProcessing(false);
        }
    }, [data, eventId]);

    const stopCamera = useCallback(() => {
        controlsRef.current?.stop();
        controlsRef.current = null;
        const stream = videoRef.current?.srcObject;
        if (stream instanceof MediaStream) {
            stream.getTracks().forEach((track) => track.stop());
        }
        if (videoRef.current) videoRef.current.srcObject = null;
        setCameraState("idle");
    }, []);

    const startCamera = useCallback(async () => {
        if (!videoRef.current) return;
        if (!navigator.mediaDevices?.getUserMedia) {
            setCameraState("error");
            setCameraError("This browser cannot access a camera. Use the secure-code field below instead.");
            return;
        }

        controlsRef.current?.stop();
        setCameraState("starting");
        setCameraError(null);
        setFeedback(null);
        try {
            const { BrowserQRCodeReader } = await import("@zxing/browser");
            const reader = new BrowserQRCodeReader(undefined, {
                delayBetweenScanAttempts: 120,
                delayBetweenScanSuccess: 500,
            });
            const controls = await reader.decodeFromConstraints(
                {
                    audio: false,
                    video: {
                        facingMode: { ideal: "environment" },
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                },
                videoRef.current,
                (result) => {
                    if (result) void submitScan(result.getText(), "camera");
                },
            );
            if (!isMountedRef.current) {
                controls.stop();
                return;
            }
            controlsRef.current = controls;
            setCameraState("active");
        } catch (startError) {
            if (!isMountedRef.current) return;
            setCameraState("error");
            const name = startError instanceof DOMException ? startError.name : "";
            setCameraError(
                name === "NotAllowedError"
                    ? "Camera access was blocked. Allow camera permission in your browser or enter the QR value below."
                    : "The camera could not start. Check that it is available and that this page uses a secure connection.",
            );
        }
    }, [submitScan]);

    useEffect(() => {
        isMountedRef.current = true;
        const videoElement = videoRef.current;
        return () => {
            isMountedRef.current = false;
            controlsRef.current?.stop();
            const stream = videoElement?.srcObject;
            if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
        };
    }, []);

    function submitManualCode(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        void submitScan(manualQrCode, "manual");
    }

    function chooseAction(action: AttendanceScanAction) {
        actionRef.current = action;
        setSelectedAction(action);
        setFeedback(null);
    }

    if (isLoading) {
        return (
            <div className="flex min-h-[520px] items-center justify-center text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-2"><LoaderCircle size={20} className="animate-spin" /> Preparing secure scanner…</span>
            </div>
        );
    }

    if (pageError || !data) {
        return (
            <div className="space-y-5">
                <Link href="/dashboard/events" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 dark:text-sky-300">
                    <ArrowLeft size={16} /> Back to events
                </Link>
                <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-8 text-center dark:border-rose-400/20 dark:bg-rose-400/10">
                    <CircleAlert size={30} className="mx-auto text-rose-600 dark:text-rose-300" />
                    <h1 className="mt-4 text-xl font-semibold text-rose-800 dark:text-rose-200">Scanner unavailable</h1>
                    <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">{pageError || "The event could not be loaded."}</p>
                </div>
            </div>
        );
    }

    const selectedDetails = ATTENDANCE_SCAN_ACTIONS[selectedAction];

    return (
        <div className="space-y-7">
            <div>
                <Link href="/dashboard/events" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 transition hover:text-sky-500 dark:text-sky-300">
                    <ArrowLeft size={16} /> Back to events
                </Link>
                <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-violet-700 dark:text-violet-300">
                            <ShieldCheck size={16} /> Secure attendance desk
                        </p>
                        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">{data.event.event_name}</h1>
                        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                            <Clock3 size={16} /> {eventDateFormatter.format(new Date(data.event.start_datetime))}
                            <span className="text-slate-300 dark:text-slate-700">—</span>
                            {eventDateFormatter.format(new Date(data.event.end_datetime))}
                        </p>
                    </div>
                    <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        </span>
                        Attendance service online
                    </div>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                    { label: "Registered", value: data.totals.registered, icon: UsersRound, color: "text-slate-700 dark:text-slate-200", iconClasses: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
                    { label: "Logged in · 1", value: data.totals.loggedIn, icon: LogIn, color: "text-emerald-600 dark:text-emerald-300", iconClasses: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300" },
                    { label: "On break · 67", value: data.totals.onBreak, icon: Coffee, color: "text-amber-600 dark:text-amber-300", iconClasses: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300" },
                    { label: "Completed · 2", value: data.totals.completed, icon: BadgeCheck, color: "text-sky-600 dark:text-sky-300", iconClasses: "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300" },
                ].map(({ label, value, icon: Icon, color, iconClasses }) => (
                    <div key={label} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">{label}</p>
                            <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
                        </div>
                        <span className={`rounded-2xl p-3 ${iconClasses}`}><Icon size={19} /></span>
                    </div>
                ))}
            </div>

            <section aria-labelledby="scan-action-title" className="rounded-[26px] border border-slate-200 bg-white/85 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 sm:p-6">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 id="scan-action-title" className="font-semibold text-slate-900 dark:text-white">Choose the attendance action</h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Every accepted scan updates the registration and creates a matching activity log.</p>
                    </div>
                    <span className="mt-2 w-fit rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-400/15 dark:text-violet-300 sm:mt-0">
                        Current: {selectedDetails.shortLabel}
                    </span>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                    {(Object.keys(ATTENDANCE_SCAN_ACTIONS) as AttendanceScanAction[]).map((action) => {
                        const details = ATTENDANCE_SCAN_ACTIONS[action];
                        const presentation = actionPresentation[action];
                        const Icon = presentation.icon;
                        const isSelected = selectedAction === action;
                        return (
                            <button
                                key={action}
                                type="button"
                                onClick={() => chooseAction(action)}
                                disabled={isProcessing}
                                aria-pressed={isSelected}
                                className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-60 ${isSelected ? presentation.active : "border-slate-200 bg-slate-50/70 text-slate-700 hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:border-slate-600"}`}
                            >
                                <span className={`rounded-xl p-2.5 ${isSelected ? presentation.iconClasses : "bg-white text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-300"}`}><Icon size={18} /></span>
                                <span>
                                    <span className="block font-semibold">{details.label} <span className="opacity-60">· {details.status}</span></span>
                                    <span className="mt-0.5 block text-xs opacity-70">{details.description}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
                <section className="overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 shadow-[0_24px_70px_-30px_rgba(15,23,42,0.8)]">
                    <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 text-white sm:px-6">
                        <div>
                            <h2 className="flex items-center gap-2 font-semibold"><ScanQrCode size={18} className="text-violet-300" /> Camera scanner</h2>
                            <p className="mt-1 text-xs text-slate-400">Align one attendee QR code inside the frame</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${cameraState === "active" ? "bg-emerald-400/15 text-emerald-300" : "bg-white/10 text-slate-300"}`}>
                            {cameraState === "active" ? "Scanning" : cameraState === "starting" ? "Starting…" : "Camera off"}
                        </span>
                    </div>

                    <div className="relative aspect-[4/3] min-h-[320px] overflow-hidden bg-[radial-gradient(circle_at_center,_#1e293b,_#020617_68%)]">
                        <video ref={videoRef} muted playsInline className={`h-full w-full object-cover transition duration-500 ${cameraState === "active" ? "opacity-100" : "opacity-25"}`} />

                        {cameraState === "active" ? (
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-12 sm:p-20">
                                <div className="relative aspect-square w-full max-w-sm rounded-[32px] bg-transparent shadow-[0_0_0_999px_rgba(2,6,23,0.52)]">
                                    <span className="absolute left-0 top-0 h-14 w-14 rounded-tl-3xl border-l-4 border-t-4 border-violet-300" />
                                    <span className="absolute right-0 top-0 h-14 w-14 rounded-tr-3xl border-r-4 border-t-4 border-violet-300" />
                                    <span className="absolute bottom-0 left-0 h-14 w-14 rounded-bl-3xl border-b-4 border-l-4 border-violet-300" />
                                    <span className="absolute bottom-0 right-0 h-14 w-14 rounded-br-3xl border-b-4 border-r-4 border-violet-300" />
                                    <span className="absolute left-5 right-5 top-1/2 h-px bg-gradient-to-r from-transparent via-violet-300 to-transparent shadow-[0_0_14px_rgba(196,181,253,0.95)] motion-safe:animate-pulse" />
                                </div>
                            </div>
                        ) : null}

                        <div className="absolute inset-0 flex items-center justify-center p-8">
                            {cameraState !== "active" ? (
                                <div className="max-w-md text-center">
                                    <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-white/10 text-violet-200 backdrop-blur">
                                        {cameraState === "starting" ? <LoaderCircle size={28} className="animate-spin" /> : cameraState === "error" ? <CameraOff size={28} /> : <Camera size={28} />}
                                    </span>
                                    <h3 className="mt-5 text-lg font-semibold text-white">
                                        {cameraState === "starting" ? "Connecting to camera…" : cameraState === "error" ? "Camera unavailable" : "Ready to scan"}
                                    </h3>
                                    <p className="mt-2 text-sm leading-6 text-slate-400">
                                        {cameraError || "Camera access stays on this device; only the decoded QR value is submitted."}
                                    </p>
                                </div>
                            ) : null}
                        </div>

                        {isProcessing ? (
                            <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/72 backdrop-blur-sm">
                                <div className="rounded-3xl border border-white/10 bg-white/10 px-6 py-5 text-center text-white shadow-2xl">
                                    <LoaderCircle size={28} className="mx-auto animate-spin text-violet-300" />
                                    <p className="mt-3 font-semibold">Recording {selectedDetails.shortLabel.toLowerCase()}…</p>
                                    <p className="mt-1 text-xs text-slate-300">Keep the code steady</p>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="flex flex-col gap-3 border-t border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                        <p className="flex items-center gap-2 text-xs text-slate-400"><ShieldCheck size={14} /> Unregistered users are rejected automatically</p>
                        {cameraState === "active" ? (
                            <button type="button" onClick={stopCamera} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15">
                                <CameraOff size={17} /> Stop camera
                            </button>
                        ) : (
                            <button type="button" onClick={() => void startCamera()} disabled={cameraState === "starting"} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-950/30 transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60">
                                {cameraState === "starting" ? <LoaderCircle size={17} className="animate-spin" /> : <ScanLine size={17} />}
                                {cameraState === "starting" ? "Starting…" : cameraState === "error" ? "Try camera again" : "Start camera"}
                            </button>
                        )}
                    </div>
                </section>

                <div className="space-y-6">
                    <section aria-live="polite" className={`min-h-48 rounded-[28px] border p-6 transition ${feedback?.kind === "success" ? "border-emerald-200 bg-emerald-50 dark:border-emerald-400/20 dark:bg-emerald-400/10" : feedback?.kind === "error" ? "border-rose-200 bg-rose-50 dark:border-rose-400/20 dark:bg-rose-400/10" : "border-slate-200 bg-white/85 dark:border-slate-800 dark:bg-slate-900/70"}`}>
                        {feedback ? (
                            <div>
                                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${feedback.kind === "success" ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}`}>
                                    {feedback.kind === "success" ? <CheckCircle2 size={24} /> : <CircleAlert size={24} />}
                                </span>
                                <p className={`mt-4 text-xs font-semibold uppercase tracking-[0.18em] ${feedback.kind === "success" ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>{feedback.title}</p>
                                <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{feedback.message}</h2>
                                {feedback.activity ? (
                                    <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                                        {feedback.activity.registrationsUpdated} registration{feedback.activity.registrationsUpdated === 1 ? "" : "s"} updated · {scanTimeFormatter.format(new Date(feedback.activity.scannedAt))}
                                    </p>
                                ) : (
                                    <p className="mt-3 text-sm text-rose-700/80 dark:text-rose-300/80">No attendance or log record was changed.</p>
                                )}
                            </div>
                        ) : (
                            <div className="flex min-h-36 flex-col justify-center">
                                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300"><ScanQrCode size={24} /></span>
                                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">Awaiting attendee</p>
                                <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">Scan a registered user QR code</h2>
                                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">The result and attendee details will appear here immediately.</p>
                            </div>
                        )}
                    </section>

                    <form onSubmit={submitManualCode} className="rounded-[28px] border border-slate-200 bg-white/85 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="flex items-center gap-3">
                            <span className="rounded-xl bg-slate-100 p-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Keyboard size={17} /></span>
                            <div>
                                <h2 className="font-semibold text-slate-900 dark:text-white">Secure-code fallback</h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400">For USB scanners or unavailable cameras</p>
                            </div>
                        </div>
                        <label className="mt-5 block">
                            <span className="sr-only">Attendee QR code value</span>
                            <input
                                value={manualQrCode}
                                onChange={(event) => setManualQrCode(event.target.value)}
                                autoFocus
                                autoComplete="off"
                                spellCheck={false}
                                placeholder="Scan or paste user_qr_code"
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 font-mono text-sm text-slate-900 outline-none transition placeholder:font-sans placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-violet-500 dark:focus:ring-violet-500/10"
                            />
                        </label>
                        <button type="submit" disabled={!manualQrCode.trim() || isProcessing} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
                            {isProcessing ? <LoaderCircle size={17} className="animate-spin" /> : <ScanLine size={17} />}
                            Record {selectedDetails.label.toLowerCase()}
                        </button>
                    </form>
                </div>
            </div>

            <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white/85 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:px-6">
                    <div>
                        <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><History size={18} className="text-violet-600 dark:text-violet-300" /> Recent scan activity</h2>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Latest accepted actions from nu_event_attendees_log</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{data.recentActivity.length} shown</span>
                </div>
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {data.recentActivity.length ? data.recentActivity.map((activity) => {
                        const Icon = actionPresentation[activity.action].icon;
                        return (
                            <div key={activity.id} className="flex flex-col gap-3 px-5 py-4 transition hover:bg-slate-50/70 dark:hover:bg-white/[0.025] sm:flex-row sm:items-center sm:justify-between sm:px-6">
                                <div className="flex min-w-0 items-center gap-3">
                                    <span className={`shrink-0 rounded-xl p-2.5 ${activityClasses(activity.action)}`}><Icon size={17} /></span>
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-slate-900 dark:text-white">{userDisplayName(activity.user)}</p>
                                        <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{activity.user.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between gap-4 pl-12 sm:justify-end sm:pl-0 sm:text-right">
                                    <div>
                                        <p className={`text-sm font-semibold ${activity.action === "login" ? "text-emerald-600 dark:text-emerald-300" : activity.action === "break" ? "text-amber-600 dark:text-amber-300" : "text-sky-600 dark:text-sky-300"}`}>{ATTENDANCE_SCAN_ACTIONS[activity.action].shortLabel} · {activity.status}</p>
                                        <p className="mt-0.5 text-xs text-slate-400">{activity.registrationsUpdated} registration{activity.registrationsUpdated === 1 ? "" : "s"} · {scanTimeFormatter.format(new Date(activity.scannedAt))}</p>
                                    </div>
                                    <BadgeCheck size={18} className="shrink-0 text-emerald-500" />
                                </div>
                            </div>
                        );
                    }) : (
                        <div className="px-6 py-12 text-center">
                            <UserRound size={28} className="mx-auto text-slate-300 dark:text-slate-600" />
                            <p className="mt-3 font-semibold text-slate-900 dark:text-white">No accepted scans yet</p>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">The first successful attendee scan will appear here.</p>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
