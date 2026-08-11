import { databaseError, requireApiUser } from "@/app/api/api-helpers";
import { EVENT_SELECT, parseEventRecord } from "@/app/api/events/event-api";
import {
    SESSION_SELECT,
    parseSessionRecord,
} from "@/app/api/events/[id]/sessions/session-api";
import { parseUserRecord, USER_SELECT } from "@/app/api/users/user-api";
import { createExcelWorkbook, type WorkbookValue } from "@/lib/excel-workbook";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { AttendanceRecord, UserRecord } from "@/lib/users";
import { userDisplayName } from "@/lib/users";

export const runtime = "nodejs";

type SessionExportContext = {
    params: Promise<{ id: string; sessionId: string }>;
};

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

function attendeeName(record: AttendanceRecord, users: UserRecord[]) {
    const profile = users.find((user) => user.auth_user_id === record.user_id);
    if (profile) return userDisplayName(profile);
    if (record.user_id) return `User ${record.user_id}`;
    return "Unknown attendee";
}

export async function GET(request: Request, context: SessionExportContext) {
    const user = await requireApiUser(request);
    if (user instanceof Response) return user;

    const params = await context.params;
    const ids = validIds(params.id, params.sessionId);
    if (!ids) return Response.json({ error: "Invalid event or session ID." }, { status: 400 });

    const format = new URL(request.url).searchParams.get("format");
    if (format !== "csv" && format !== "excel") {
        return Response.json({ error: "Choose either csv or excel format." }, { status: 400 });
    }

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
    const headers: WorkbookValue[] = [
        "Event Title",
        "Session ID",
        "Session Topic",
        "Session Date",
        "Start Time",
        "End Time",
        "Venue",
        "Attendee Record ID",
        "User ID",
        "Attendee Name",
        "Email",
        "Phone",
        "First Check-in",
        "Last Check-out",
        "Attendance State",
        "Status Code",
        "Event Day Index",
    ];
    const rows: WorkbookValue[][] = [
        headers,
        ...attendance.map((record) => {
            const profile = users.find((candidate) => candidate.auth_user_id === record.user_id);
            const attendanceState = record.date_time_first_in && !record.date_time_last_out
                ? "Currently attending"
                : record.date_time_first_in
                    ? "Attended"
                    : "Registered";

            return [
                event.event_name,
                session.id,
                session.session_topic,
                session.session_date,
                session.session_start_time,
                session.session_end_time,
                venue,
                record.id,
                record.user_id,
                attendeeName(record, users),
                profile?.email || "",
                profile?.phone || "",
                record.date_time_first_in,
                record.date_time_last_out,
                attendanceState,
                record.status,
                record.date_index,
            ];
        }),
    ];
    const fileBase = `${safeFilename(event.event_name)}-${safeFilename(session.session_topic)}-attendees`;
    const commonHeaders = {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${fileBase}.${format === "csv" ? "csv" : "xlsx"}"`,
        "X-Content-Type-Options": "nosniff",
    };

    if (format === "csv") {
        return new Response(createCsv(rows), {
            headers: {
                ...commonHeaders,
                "Content-Type": "text/csv; charset=utf-8",
            },
        });
    }

    return new Response(new Uint8Array(createExcelWorkbook(rows)), {
        headers: {
            ...commonHeaders,
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
    });
}
