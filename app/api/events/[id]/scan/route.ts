import { z } from "zod";
import { databaseError } from "@/app/api/api-helpers";
import {
    EVENT_SELECT,
    parseEventRecord,
    requireEventApiUser,
} from "@/app/api/events/event-api";
import { parseUserRecord, USER_SELECT } from "@/app/api/users/user-api";
import {
    actionForAttendanceStatus,
    ATTENDANCE_SCAN_ACTIONS,
    type AttendanceScanAction,
    type AttendanceScanStatus,
    type EventScannerActivity,
    type EventScannerResponse,
    type EventScannerTotals,
    type EventScanMutationResponse,
} from "@/lib/event-scanner";
import type { AttendanceRecord, UserRecord } from "@/lib/users";
import { getSupabaseAdmin, insertWithIdentityRecovery } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ATTENDANCE_SELECT =
    "id, created_at, user_id, event_id, date_time_first_in, date_time_last_out, date_index, status, session_id";
const LOG_SELECT = "id, created_at, event_id, user_id, date_time, date_index, session_id, log_type";
const MANILA_TIME_ZONE = "Asia/Manila";

type EventScanContext = {
    params: Promise<{ id: string }>;
};

type RawAttendanceLog = {
    id: number;
    created_at: string;
    event_id: number;
    user_id: string | null;
    date_time: string;
    date_index: number | null;
    session_id: number;
    log_type: number;
};

const scanInputSchema = z.object({
    qrCode: z
        .string()
        .trim()
        .min(1, "Scan or enter an attendee QR code.")
        .max(2953, "The scanned QR code is too long."),
    action: z.enum(["login", "break", "complete"]),
});

function parseEventId(value: string) {
    const eventId = Number(value);
    return Number.isSafeInteger(eventId) && eventId > 0 ? eventId : null;
}

function attendeeKey(record: AttendanceRecord) {
    return record.user_id || `record-${record.id}`;
}

function scannerTotals(attendance: AttendanceRecord[]): EventScannerTotals {
    const countUnique = (predicate: (record: AttendanceRecord) => boolean) =>
        new Set(attendance.filter(predicate).map(attendeeKey)).size;

    return {
        registered: countUnique(() => true),
        loggedIn: countUnique((record) => record.status === ATTENDANCE_SCAN_ACTIONS.login.status),
        onBreak: countUnique((record) => record.status === ATTENDANCE_SCAN_ACTIONS.break.status),
        completed: countUnique((record) => record.status === ATTENDANCE_SCAN_ACTIONS.complete.status),
    };
}

function dateParts(value: Date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: MANILA_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((item) => item.type === type)?.value || 0);

    return { year: part("year"), month: part("month"), day: part("day") };
}

function eventDayIndex(eventStart: string, scannedAt: Date) {
    const start = dateParts(new Date(eventStart));
    const scan = dateParts(scannedAt);
    const startDay = Date.UTC(start.year, start.month - 1, start.day);
    const scanDay = Date.UTC(scan.year, scan.month - 1, scan.day);
    return Math.max(0, Math.floor((scanDay - startDay) / 86_400_000));
}

function transitionError(action: AttendanceScanAction, attendance: AttendanceRecord[]) {
    const statuses = new Set(attendance.map((record) => record.status));

    if (statuses.has(ATTENDANCE_SCAN_ACTIONS.complete.status)) {
        return "This attendee has already completed the event. No new activity was recorded.";
    }
    if (action === "login" && statuses.has(ATTENDANCE_SCAN_ACTIONS.login.status)) {
        return "This attendee is already logged in.";
    }
    if (action === "break" && [...statuses].some((status) => status !== ATTENDANCE_SCAN_ACTIONS.login.status)) {
        return "This attendee must be logged in before starting a break.";
    }
    if (action === "complete" && [...statuses].some((status) =>
        status !== ATTENDANCE_SCAN_ACTIONS.login.status &&
        status !== ATTENDANCE_SCAN_ACTIONS.break.status
    )) {
        return "This attendee must log in before completing the event.";
    }
    if (action === "login" && [...statuses].some((status) =>
        status !== 0 && status !== ATTENDANCE_SCAN_ACTIONS.break.status
    )) {
        return "The attendee has an unsupported attendance status. Review the registration before scanning again.";
    }

    return null;
}

function groupRecentActivity(
    logs: RawAttendanceLog[],
    users: UserRecord[],
    sessions: Array<{ id: number; session_topic: string }>,
) {
    const usersByAuthId = new Map<string, UserRecord>();
    for (const user of users) {
        if (user.auth_user_id && !usersByAuthId.has(user.auth_user_id)) {
            usersByAuthId.set(user.auth_user_id, user);
        }
    }
    const sessionNames = new Map(sessions.map((session) => [session.id, session.session_topic]));
    const grouped = new Map<string, RawAttendanceLog[]>();

    for (const log of logs) {
        const key = `${log.user_id || "unknown"}|${log.date_time}|${log.log_type}`;
        grouped.set(key, [...(grouped.get(key) || []), log]);
    }

    const activity: EventScannerActivity[] = [];
    for (const groupedLogs of grouped.values()) {
        const first = groupedLogs[0];
        const action = actionForAttendanceStatus(first.log_type);
        const user = first.user_id ? usersByAuthId.get(first.user_id) : null;
        if (!action || !user) continue;

        activity.push({
            id: `${first.id}-${groupedLogs.length}`,
            scannedAt: first.date_time,
            action,
            status: first.log_type as AttendanceScanStatus,
            user,
            registrationsUpdated: groupedLogs.length,
            sessionTopics: [...new Set(
                groupedLogs.map((log) => sessionNames.get(log.session_id) || `Session #${log.session_id}`),
            )],
        });
    }

    return activity.slice(0, 12);
}

async function rollbackAttendance(
    attendance: AttendanceRecord[],
    targetStatus: AttendanceScanStatus,
) {
    const admin = getSupabaseAdmin();
    await Promise.all(attendance.map((record) =>
        admin
            .from("nu_event_attendees")
            .update({
                date_time_first_in: record.date_time_first_in,
                date_time_last_out: record.date_time_last_out,
                date_index: record.date_index,
                status: record.status,
            })
            .eq("id", record.id)
            .eq("status", targetStatus),
    ));
}

export async function GET(request: Request, context: EventScanContext) {
    const apiUser = await requireEventApiUser(request);
    if (apiUser instanceof Response) return apiUser;

    const { id } = await context.params;
    const eventId = parseEventId(id);
    if (!eventId) return Response.json({ error: "Invalid event ID." }, { status: 400 });

    const admin = getSupabaseAdmin();
    const [eventResult, attendanceResult, logsResult] = await Promise.all([
        admin.from("nu_events").select(EVENT_SELECT).eq("id", eventId).maybeSingle(),
        admin
            .from("nu_event_attendees")
            .select(ATTENDANCE_SELECT)
            .eq("event_id", eventId)
            .order("created_at", { ascending: false })
            .limit(5000),
        admin
            .from("nu_event_attendees_log")
            .select(LOG_SELECT)
            .eq("event_id", eventId)
            .order("date_time", { ascending: false })
            .limit(60),
    ]);
    const initialError = eventResult.error || attendanceResult.error || logsResult.error;
    if (initialError) return databaseError(initialError, "Unable to prepare the event scanner.");
    if (!eventResult.data) return Response.json({ error: "Event not found." }, { status: 404 });

    const attendance = (attendanceResult.data || []) as AttendanceRecord[];
    const logs = (logsResult.data || []) as RawAttendanceLog[];
    const userIds = [...new Set(logs.map((log) => log.user_id).filter((value): value is string => Boolean(value)))];
    const sessionIds = [...new Set(logs.map((log) => log.session_id))];
    const [usersResult, sessionsResult] = await Promise.all([
        userIds.length
            ? admin.from("nu_users").select(USER_SELECT).in("userID", userIds)
            : Promise.resolve({ data: [], error: null }),
        sessionIds.length
            ? admin.from("nu_event_sessions").select("id, session_topic").in("id", sessionIds)
            : Promise.resolve({ data: [], error: null }),
    ]);
    const relationError = usersResult.error || sessionsResult.error;
    if (relationError) return databaseError(relationError, "Unable to load recent scanner activity.");

    const response: EventScannerResponse = {
        event: parseEventRecord(eventResult.data),
        totals: scannerTotals(attendance),
        recentActivity: groupRecentActivity(
            logs,
            (usersResult.data || []).map(parseUserRecord),
            (sessionsResult.data || []) as Array<{ id: number; session_topic: string }>,
        ),
    };
    return Response.json(response);
}

export async function POST(request: Request, context: EventScanContext) {
    const apiUser = await requireEventApiUser(request);
    if (apiUser instanceof Response) return apiUser;

    const { id } = await context.params;
    const eventId = parseEventId(id);
    if (!eventId) return Response.json({ error: "Invalid event ID." }, { status: 400 });

    let input: z.infer<typeof scanInputSchema>;
    try {
        const parsed = scanInputSchema.safeParse(await request.json());
        if (!parsed.success) {
            return Response.json(
                { error: parsed.error.issues[0]?.message || "Check the scan details and try again." },
                { status: 422 },
            );
        }
        input = parsed.data;
    } catch {
        return Response.json({ error: "The request body must be valid JSON." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const [eventResult, usersResult, attendanceResult] = await Promise.all([
        admin.from("nu_events").select(EVENT_SELECT).eq("id", eventId).maybeSingle(),
        admin.from("nu_users").select(USER_SELECT).eq("user_qr_code", input.qrCode).limit(10),
        admin
            .from("nu_event_attendees")
            .select(ATTENDANCE_SELECT)
            .eq("event_id", eventId)
            .order("created_at", { ascending: false })
            .limit(5000),
    ]);
    const lookupError = eventResult.error || usersResult.error || attendanceResult.error;
    if (lookupError) return databaseError(lookupError, "Unable to validate the scanned attendee.");
    if (!eventResult.data) return Response.json({ error: "Event not found." }, { status: 404 });

    const matchedUsers = (usersResult.data || []).map(parseUserRecord);
    if (!matchedUsers.length) {
        return Response.json(
            { error: "This QR code does not match a user profile. No attendance was recorded." },
            { status: 404 },
        );
    }

    const authUserIds = [...new Set(
        matchedUsers.map((user) => user.auth_user_id).filter((value): value is string => Boolean(value)),
    )];
    if (!authUserIds.length) {
        return Response.json(
            { error: "This user profile is not linked to an authentication user ID." },
            { status: 409 },
        );
    }
    if (authUserIds.length > 1) {
        return Response.json(
            { error: "This QR value belongs to multiple user accounts. Resolve the duplicate before scanning." },
            { status: 409 },
        );
    }

    const authUserId = authUserIds[0];
    const user = matchedUsers.find((candidate) => candidate.auth_user_id === authUserId)!;
    const allAttendance = (attendanceResult.data || []) as AttendanceRecord[];
    const attendeeRegistrations = allAttendance.filter((record) => record.user_id === authUserId);
    if (!attendeeRegistrations.length) {
        return Response.json(
            { error: "This user is not registered for this event. No attendance was recorded." },
            { status: 403 },
        );
    }

    const invalidTransition = transitionError(input.action, attendeeRegistrations);
    if (invalidTransition) {
        return Response.json({ error: invalidTransition }, { status: 409 });
    }

    const event = parseEventRecord(eventResult.data);
    const status = ATTENDANCE_SCAN_ACTIONS[input.action].status;
    const scannedAtDate = new Date();
    const scannedAt = scannedAtDate.toISOString();
    const dateIndex = eventDayIndex(event.start_datetime, scannedAtDate);
    const updateResults = await Promise.all(attendeeRegistrations.map((record) =>
        admin
            .from("nu_event_attendees")
            .update({
                date_time_first_in: record.date_time_first_in || scannedAt,
                date_time_last_out: input.action === "login" ? null : scannedAt,
                date_index: dateIndex,
                status,
            })
            .eq("id", record.id)
            .eq("status", record.status)
            .select(ATTENDANCE_SELECT)
            .maybeSingle(),
    ));
    const updateError = updateResults.find((result) => result.error)?.error;
    const updatedRows = updateResults
        .map((result) => result.data as AttendanceRecord | null)
        .filter((record): record is AttendanceRecord => Boolean(record));
    if (updateError || updatedRows.length !== attendeeRegistrations.length) {
        await rollbackAttendance(updatedRows, status);
        return updateError
            ? databaseError(updateError, "Unable to save the attendance status.")
            : Response.json(
                { error: "The attendance status changed during this scan. Review the attendee and try again." },
                { status: 409 },
            );
    }

    const insertedLogIds: number[] = [];
    for (const record of attendeeRegistrations) {
        const logResult = await insertWithIdentityRecovery(
            "nu_event_attendees_log",
            {
                event_id: eventId,
                user_id: authUserId,
                date_time: scannedAt,
                date_index: dateIndex,
                session_id: record.session_id,
                log_type: status,
            },
            LOG_SELECT,
        );
        if (logResult.error) {
            if (insertedLogIds.length) {
                await admin.from("nu_event_attendees_log").delete().in("id", insertedLogIds);
            }
            await rollbackAttendance(updatedRows, status);
            return databaseError(logResult.error, "Unable to record the scanner activity log.");
        }
        const insertedId = Number((logResult.data as { id?: number } | null)?.id);
        if (Number.isSafeInteger(insertedId)) insertedLogIds.push(insertedId);
    }

    const sessionIds = [...new Set(attendeeRegistrations.map((record) => record.session_id))];
    const sessionsResult = sessionIds.length
        ? await admin.from("nu_event_sessions").select("id, session_topic").in("id", sessionIds)
        : { data: [], error: null };
    const sessionNames = new Map(
        ((sessionsResult.data || []) as Array<{ id: number; session_topic: string }>)
            .map((session) => [session.id, session.session_topic]),
    );
    const activity: EventScannerActivity = {
        id: `${insertedLogIds[0] || scannedAt}-${insertedLogIds.length}`,
        scannedAt,
        action: input.action,
        status,
        user,
        registrationsUpdated: attendeeRegistrations.length,
        sessionTopics: sessionIds.map((sessionId) => sessionNames.get(sessionId) || `Session #${sessionId}`),
    };
    const updatedAttendance = allAttendance.map((record) =>
        record.user_id === authUserId
            ? {
                ...record,
                status,
                date_time_first_in: record.date_time_first_in || scannedAt,
                date_time_last_out: input.action === "login" ? null : scannedAt,
                date_index: dateIndex,
            }
            : record,
    );
    const response: EventScanMutationResponse = {
        message: `${ATTENDANCE_SCAN_ACTIONS[input.action].shortLabel}: ${user.email}`,
        activity,
        totals: scannerTotals(updatedAttendance),
    };

    return Response.json(response);
}
