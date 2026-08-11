import { databaseError, requireApiUser } from "@/app/api/api-helpers";
import { EVENT_SELECT, parseEventRecord } from "@/app/api/events/event-api";
import {
    SESSION_SELECT,
    parseSessionRecord,
} from "@/app/api/events/[id]/sessions/session-api";
import { parseUserRecord, USER_SELECT } from "@/app/api/users/user-api";
import type { EventAttendeeDetail, SessionAttendeesResponse } from "@/lib/event-attendees";
import { attendanceState, type AttendanceRecord } from "@/lib/users";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

type SessionAttendeesContext = {
    params: Promise<{ id: string; sessionId: string }>;
};

function parseIds(id: string, sessionId: string) {
    const eventId = Number(id);
    const parsedSessionId = Number(sessionId);

    return Number.isSafeInteger(eventId) && eventId > 0 &&
        Number.isSafeInteger(parsedSessionId) && parsedSessionId > 0
        ? { eventId, sessionId: parsedSessionId }
        : null;
}

export async function GET(request: Request, context: SessionAttendeesContext) {
    const user = await requireApiUser(request);
    if (user instanceof Response) return user;

    const params = await context.params;
    const ids = parseIds(params.id, params.sessionId);
    if (!ids) return Response.json({ error: "Invalid event or session ID." }, { status: 400 });

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
            .order("created_at", { ascending: false })
            .limit(5000),
    ]);
    const initialError = eventResult.error || sessionResult.error || attendanceResult.error;
    if (initialError) return databaseError(initialError, "Unable to load session attendees.");
    if (!eventResult.data) return Response.json({ error: "Event not found." }, { status: 404 });
    if (!sessionResult.data) return Response.json({ error: "Session not found for this event." }, { status: 404 });

    const attendance = (attendanceResult.data || []) as AttendanceRecord[];
    const userIds = [...new Set(
        attendance.map((record) => record.user_id).filter((value): value is string => Boolean(value)),
    )];
    const usersResult = userIds.length
        ? await admin.from("nu_users").select(USER_SELECT).in("userID", userIds)
        : { data: [], error: null };
    if (usersResult.error) return databaseError(usersResult.error, "Unable to load attendee profiles.");

    const users = (usersResult.data || []).map(parseUserRecord);
    const session = parseSessionRecord(sessionResult.data);
    const attendees: EventAttendeeDetail[] = attendance.map((record) => ({
        attendance: record,
        user: users.find((item) => item.auth_user_id === record.user_id) || null,
        session,
        state: attendanceState(record),
    }));
    const response: SessionAttendeesResponse = {
        event: parseEventRecord(eventResult.data),
        session,
        attendees,
    };

    return Response.json(response);
}
