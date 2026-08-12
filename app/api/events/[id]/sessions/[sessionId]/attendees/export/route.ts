import { databaseError, requireApiUser } from "@/app/api/api-helpers";
import { EVENT_SELECT, parseEventRecord } from "@/app/api/events/event-api";
import {
    SESSION_SELECT,
    parseSessionRecord,
} from "@/app/api/events/[id]/sessions/session-api";
import { parseUserRecord, USER_SELECT } from "@/app/api/users/user-api";
import type { EventRecord } from "@/lib/events";
import type { EventSessionRecord } from "@/lib/event-sessions";
import { createExcelWorkbook, type WorkbookValue } from "@/lib/excel-workbook";
import {
    createSessionAttendeeExportRow,
    defaultSessionAttendeeExportSelection,
    SESSION_ATTENDEE_EXPORT_COLUMNS,
    type SessionAttendeeExportFieldKey,
    type SessionAttendeeExportRow,
    type SessionAttendeeExportSelection,
} from "@/lib/session-attendee-export";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { AttendanceRecord, UserRecord } from "@/lib/users";
import {
    createWordDocument,
    imageDimensions,
    type WordReportImage,
} from "@/lib/word-document";

export const runtime = "nodejs";

type SessionExportContext = {
    params: Promise<{ id: string; sessionId: string }>;
};

type ExportFormat = "csv" | "excel" | "word";

type SessionExportBundle = {
    event: EventRecord;
    session: EventSessionRecord;
    attendance: AttendanceRecord[];
    users: UserRecord[];
    venue: string;
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function validIds(id: string, sessionId: string) {
    const eventId = Number(id);
    const parsedSessionId = Number(sessionId);

    return Number.isSafeInteger(eventId) && eventId > 0 &&
        Number.isSafeInteger(parsedSessionId) && parsedSessionId > 0
        ? { eventId, sessionId: parsedSessionId }
        : null;
}

function safeFilename(value: string) {
    const cleaned = value
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
    return cleaned.slice(0, 80) || "session";
}

function csvCell(value: WorkbookValue) {
    let text = value === null ? "" : String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}

function createCsv(rows: WorkbookValue[][]) {
    return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

async function loadExportBundle(ids: { eventId: number; sessionId: number }): Promise<SessionExportBundle | Response> {
    const admin = getSupabaseAdmin();
    const [eventResult, sessionResult, attendanceResult] = await Promise.all([
        admin.from("nu_events").select(EVENT_SELECT).eq("id", ids.eventId).maybeSingle(),
        admin
            .from("nu_event_sessions")
            .select(SESSION_SELECT)
            .eq("id", ids.sessionId)
            .eq("session_event_id", ids.eventId)
            .maybeSingle(),
        admin
            .from("nu_event_attendees")
            .select("id, created_at, user_id, event_id, date_time_first_in, date_time_last_out, date_index, status, session_id")
            .eq("event_id", ids.eventId)
            .eq("session_id", ids.sessionId)
            .order("created_at", { ascending: true })
            .limit(5000),
    ]);
    const initialError = eventResult.error || sessionResult.error || attendanceResult.error;
    if (initialError) return databaseError(initialError, "Unable to prepare the attendee export.");
    if (!eventResult.data) return Response.json({ error: "Event not found." }, { status: 404 });
    if (!sessionResult.data) {
        return Response.json({ error: "Session not found for this event." }, { status: 404 });
    }

    const event = parseEventRecord(eventResult.data);
    const session = parseSessionRecord(sessionResult.data);
    const attendance = (attendanceResult.data || []) as AttendanceRecord[];
    const userIds = [...new Set(
        attendance.map((record) => record.user_id).filter((value): value is string => Boolean(value)),
    )];
    const [usersResult, buildingResult, floorResult, roomResult] = await Promise.all([
        userIds.length
            ? admin.from("nu_users").select(USER_SELECT).in("userID", userIds)
            : Promise.resolve({ data: [], error: null }),
        admin
            .from("nu_buildings")
            .select("building_name")
            .eq("id", session.session_building_id)
            .maybeSingle(),
        admin
            .from("nu_floors")
            .select("floor_name")
            .eq("id", session.session_floor_id)
            .maybeSingle(),
        admin
            .from("nu_rooms")
            .select("room_no")
            .eq("id", session.session_room_id)
            .maybeSingle(),
    ]);
    const relationError =
        usersResult.error || buildingResult.error || floorResult.error || roomResult.error;
    if (relationError) return databaseError(relationError, "Unable to prepare attendee details.");

    const users = (usersResult.data || []).map(parseUserRecord);
    const venue = [
        buildingResult.data?.building_name || `Building ${session.session_building_id}`,
        floorResult.data?.floor_name || `Floor ${session.session_floor_id}`,
        `Room ${roomResult.data?.room_no || session.session_room_id}`,
    ].join(" · ");

    return { event, session, attendance, users, venue };
}

function exportRows(bundle: SessionExportBundle) {
    const usersById = new Map(
        bundle.users
            .filter((user): user is UserRecord & { auth_user_id: string } => Boolean(user.auth_user_id))
            .map((user) => [user.auth_user_id, user]),
    );

    return bundle.attendance.map((attendance) => createSessionAttendeeExportRow({
        event: bundle.event,
        session: bundle.session,
        venue: bundle.venue,
        attendance,
        profile: attendance.user_id ? usersById.get(attendance.user_id) || null : null,
    }));
}

function selectedWorkbookRows(
    rows: SessionAttendeeExportRow[],
    selection: SessionAttendeeExportSelection[],
) {
    return [
        selection.map((field) => field.label),
        ...rows.map((row) => selection.map((field) => row[field.key])),
    ];
}

function parseSelection(rawSelection: FormDataEntryValue | null) {
    if (typeof rawSelection !== "string") {
        return Response.json({ error: "Choose at least one export field." }, { status: 422 });
    }

    let input: unknown;
    try {
        input = JSON.parse(rawSelection);
    } catch {
        return Response.json({ error: "The export field configuration is invalid." }, { status: 400 });
    }

    if (!Array.isArray(input) || input.length < 1 || input.length > SESSION_ATTENDEE_EXPORT_COLUMNS.length) {
        return Response.json({ error: "Choose between 1 and 17 export fields." }, { status: 422 });
    }

    const validKeys = new Set<string>(SESSION_ATTENDEE_EXPORT_COLUMNS.map((column) => column.key));
    const usedKeys = new Set<string>();
    const selection: SessionAttendeeExportSelection[] = [];

    for (const item of input) {
        if (!item || typeof item !== "object") {
            return Response.json({ error: "The export field configuration is invalid." }, { status: 400 });
        }

        const key = "key" in item ? item.key : null;
        const rawLabel = "label" in item ? item.label : null;
        const label = typeof rawLabel === "string" ? rawLabel.trim() : "";

        if (typeof key !== "string" || !validKeys.has(key) || usedKeys.has(key)) {
            return Response.json({ error: "The export contains an invalid or repeated field." }, { status: 422 });
        }
        if (!label || label.length > 80 || /[\u0000-\u001F]/.test(label)) {
            return Response.json({ error: "Every selected field needs a label of up to 80 characters." }, { status: 422 });
        }

        usedKeys.add(key);
        selection.push({ key: key as SessionAttendeeExportFieldKey, label });
    }

    return selection;
}

async function uploadedImage(
    entry: FormDataEntryValue | null,
    label: "Header" | "Footer",
): Promise<WordReportImage | null> {
    if (!entry || typeof entry === "string" || entry.size === 0) return null;
    if (entry.size > MAX_IMAGE_BYTES) {
        throw new Error(`${label} image must be 2 MB or smaller.`);
    }

    const normalizedType = entry.type.toLowerCase() === "image/jpg"
        ? "image/jpeg"
        : entry.type.toLowerCase();
    if (normalizedType !== "image/png" && normalizedType !== "image/jpeg") {
        throw new Error(`${label} image must be a PNG or JPEG file.`);
    }

    const data = Buffer.from(await entry.arrayBuffer());
    const dimensions = imageDimensions(data, normalizedType);
    return {
        data,
        mimeType: normalizedType,
        ...dimensions,
    };
}

function downloadResponse(
    bundle: SessionExportBundle,
    rows: SessionAttendeeExportRow[],
    selection: SessionAttendeeExportSelection[],
    format: ExportFormat,
    images?: { headerImage: WordReportImage | null; footerImage: WordReportImage | null },
) {
    const workbookRows = selectedWorkbookRows(rows, selection);
    const fileBase = `${safeFilename(bundle.event.event_name)}-${safeFilename(bundle.session.session_topic)}-attendees`;
    const extension = format === "csv" ? "csv" : format === "excel" ? "xlsx" : "docx";
    const commonHeaders = {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${fileBase}.${extension}"`,
        "X-Content-Type-Options": "nosniff",
    };

    if (format === "csv") {
        return new Response(createCsv(workbookRows), {
            headers: {
                ...commonHeaders,
                "Content-Type": "text/csv; charset=utf-8",
            },
        });
    }

    if (format === "excel") {
        return new Response(new Uint8Array(createExcelWorkbook(workbookRows)), {
            headers: {
                ...commonHeaders,
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
        });
    }

    const document = createWordDocument({
        title: bundle.event.event_name,
        subtitle: `${bundle.session.session_topic} · ${bundle.session.session_date} · ${rows.length} attendee record${rows.length === 1 ? "" : "s"}`,
        columns: selection.map((field) => field.label),
        rows: workbookRows.slice(1),
        headerImage: images?.headerImage,
        footerImage: images?.footerImage,
    });
    return new Response(new Uint8Array(document), {
        headers: {
            ...commonHeaders,
            "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
    });
}

export async function GET(request: Request, context: SessionExportContext) {
    const user = await requireApiUser(request);
    if (user instanceof Response) return user;

    const params = await context.params;
    const ids = validIds(params.id, params.sessionId);
    if (!ids) return Response.json({ error: "Invalid event or session ID." }, { status: 400 });

    const format = new URL(request.url).searchParams.get("format");
    if (format !== null && format !== "csv" && format !== "excel") {
        return Response.json({ error: "Choose either csv or excel format." }, { status: 400 });
    }

    const bundle = await loadExportBundle(ids);
    if (bundle instanceof Response) return bundle;
    const rows = exportRows(bundle);

    if (format === null) {
        return Response.json(
            {
                event: { id: bundle.event.id, name: bundle.event.event_name },
                session: {
                    id: bundle.session.id,
                    topic: bundle.session.session_topic,
                    date: bundle.session.session_date,
                },
                columns: SESSION_ATTENDEE_EXPORT_COLUMNS,
                rowCount: rows.length,
                sampleRows: rows.slice(0, 5),
            },
            { headers: { "Cache-Control": "private, no-store" } },
        );
    }

    return downloadResponse(
        bundle,
        rows,
        defaultSessionAttendeeExportSelection(),
        format,
    );
}

export async function POST(request: Request, context: SessionExportContext) {
    const user = await requireApiUser(request);
    if (user instanceof Response) return user;

    const params = await context.params;
    const ids = validIds(params.id, params.sessionId);
    if (!ids) return Response.json({ error: "Invalid event or session ID." }, { status: 400 });

    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return Response.json({ error: "The export request is invalid." }, { status: 400 });
    }

    const format = formData.get("format");
    if (format !== "csv" && format !== "excel" && format !== "word") {
        return Response.json({ error: "Choose CSV, Excel, or Microsoft Word format." }, { status: 422 });
    }

    const selection = parseSelection(formData.get("fields"));
    if (selection instanceof Response) return selection;

    let images: { headerImage: WordReportImage | null; footerImage: WordReportImage | null } | undefined;
    if (format === "word") {
        try {
            const [headerImage, footerImage] = await Promise.all([
                uploadedImage(formData.get("headerImage"), "Header"),
                uploadedImage(formData.get("footerImage"), "Footer"),
            ]);
            images = { headerImage, footerImage };
        } catch (error) {
            return Response.json(
                { error: error instanceof Error ? error.message : "Unable to read the Word images." },
                { status: 422 },
            );
        }
    }

    const bundle = await loadExportBundle(ids);
    if (bundle instanceof Response) return bundle;

    return downloadResponse(bundle, exportRows(bundle), selection, format, images);
}
