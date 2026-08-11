import { databaseError, requireApiUser } from "@/app/api/api-helpers";
import { EVENT_SELECT, parseEventRecord } from "@/app/api/events/event-api";
import {
    SESSION_SELECT,
    parseSessionRecord,
} from "@/app/api/events/[id]/sessions/session-api";
import { parseUserRecord, USER_SELECT } from "@/app/api/users/user-api";
import type {
    AttendanceLogRecord,
    AttendeeLogsResponse,
    EventAttendeeDetail,
} from "@/lib/event-attendees";
import { attendanceState, type AttendanceRecord } from "@/lib/users";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

type AttendeeLogsContext = {
    params: Promise<{ id: string; sessionId: string; attendeeId: string }>;
};

export async function GET(request: Request, context: AttendeeLogsContext) {
    const user = await requireApiUser(request);
    if (user instanceof Response) return user;

    const params = await context.params;
    const eventId = Number(params.id);
    const sessionId = Number(params.sessionId);
    const attendeeId = Number(params.attendeeId);
    if (![eventId, sessionId, attendeeId].every((value) => Number.isSafeInteger(value) && value > 0)) {
        return Response.json({ error: "Invalid event, session, or attendee ID." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const [eventResult, sessionResult, attendeeResult] = await Promise.all([
        admin.from("nu_events").select(EVENT_SELECT).eq("id", eventId).maybeSingle(),
        admin
            .from("nu_event_sessions")
            .select(SESSION_SELECT)
            .eq("id", sessionId)
            .eq("session_event_id", eventId)
            .maybeSingle(),
        admin
            .from("nu_event_attendees")
            .select("id, created_at, user_id, event_id, date_time_first_in, date_time_last_out, date_index, status, session_id")
            .eq("id", attendeeId)
            .eq("event_id", eventId)
            .eq("session_id", sessionId)
            .maybeSingle(),
    ]);
    const initialError = eventResult.error || sessionResult.error || attendeeResult.error;
    if (initialError) return databaseError(initialError, "Unable to load attendee activity.");
    if (!eventResult.data || !sessionResult.data || !attendeeResult.data) {
        return Response.json({ error: "The event, session, or attendee was not found." }, { status: 404 });
    }

    const attendance = attendeeResult.data as AttendanceRecord;
    const [userResult, logsResult] = await Promise.all([
        attendance.user_id
            ? admin.from("nu_users").select(USER_SELECT).eq("userID", attendance.user_id).limit(1).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        attendance.user_id
            ? admin
                .from("nu_event_attendees_log")
                .select("id, created_at, event_id, user_id, date_time, date_index, session_id, log_type")
                .eq("event_id", eventId)
                .eq("session_id", sessionId)
                .eq("user_id", attendance.user_id)
                .order("date_time", { ascending: true })
                .limit(5000)
            : Promise.resolve({ data: [], error: null }),
    ]);
    const relationError = userResult.error || logsResult.error;
    if (relationError) return databaseError(relationError, "Unable to load login and logout logs.");

    const session = parseSessionRecord(sessionResult.data);
    const attendee: EventAttendeeDetail = {
        attendance,
        user: userResult.data ? parseUserRecord(userResult.data) : null,
        session,
        state: attendanceState(attendance),
    };
    const response: AttendeeLogsResponse = {
        event: parseEventRecord(eventResult.data),
        session,
        attendee,
        logs: (logsResult.data || []) as AttendanceLogRecord[],
    };

    return Response.json(response);
}
