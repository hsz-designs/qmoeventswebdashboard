import { databaseError, requireApiUser } from "@/app/api/api-helpers";
import { EVENT_SELECT, parseEventRecord } from "@/app/api/events/event-api";
import { SESSION_SELECT } from "@/app/api/events/[id]/sessions/session-api";
import { parseUserRecord, USER_SELECT } from "@/app/api/users/user-api";
import type { EventAttendeeDetail, EventAttendeesResponse } from "@/lib/event-attendees";
import type { AttendanceRecord, AttendanceSession } from "@/lib/users";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

type EventAttendeesContext = {
    params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: EventAttendeesContext) {
    const user = await requireApiUser(request);
    if (user instanceof Response) return user;

    const { id } = await context.params;
    const eventId = Number(id);
    if (!Number.isSafeInteger(eventId) || eventId <= 0) {
        return Response.json({ error: "Invalid event ID." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const [eventResult, attendanceResult] = await Promise.all([
        admin.from("nu_events").select(EVENT_SELECT).eq("id", eventId).maybeSingle(),
        admin
            .from("nu_event_attendees")
            .select("id, created_at, user_id, event_id, date_time_first_in, date_time_last_out, date_index, status, session_id")
            .eq("event_id", eventId)
            .order("created_at", { ascending: false })
            .limit(5000),
    ]);
    const initialError = eventResult.error || attendanceResult.error;
    if (initialError) return databaseError(initialError, "Unable to load event attendees.");
    if (!eventResult.data) return Response.json({ error: "Event not found." }, { status: 404 });

    const attendance = (attendanceResult.data || []) as AttendanceRecord[];
    const userIds = [...new Set(attendance.map((record) => record.user_id).filter((value): value is string => Boolean(value)))];
    const sessionIds = [...new Set(attendance.map((record) => record.session_id))];
    const [usersResult, sessionsResult] = await Promise.all([
        userIds.length
            ? admin.from("nu_users").select(USER_SELECT).in("userID", userIds)
            : Promise.resolve({ data: [], error: null }),
        sessionIds.length
            ? admin.from("nu_event_sessions").select(SESSION_SELECT).in("id", sessionIds)
            : Promise.resolve({ data: [], error: null }),
    ]);
    const relationError = usersResult.error || sessionsResult.error;
    if (relationError) return databaseError(relationError, "Unable to load attendee details.");

    const users = (usersResult.data || []).map(parseUserRecord);
    const sessions = (sessionsResult.data || []) as AttendanceSession[];
    const attendees: EventAttendeeDetail[] = attendance.map((record) => ({
        attendance: record,
        user: users.find((item) => item.auth_user_id === record.user_id) || null,
        session: sessions.find((session) => session.id === record.session_id) || null,
        state: record.date_time_first_in && !record.date_time_last_out
            ? "currently_attending"
            : record.date_time_first_in
                ? "attended"
                : "registered",
    }));

    const response: EventAttendeesResponse = {
        event: parseEventRecord(eventResult.data),
        attendees,
    };
    return Response.json(response);
}
