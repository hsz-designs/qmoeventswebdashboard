import { databaseError, requireApiUser } from "@/app/api/api-helpers";
import { EVENT_SELECT, parseEventRecord } from "@/app/api/events/event-api";
import { SESSION_SELECT } from "@/app/api/events/[id]/sessions/session-api";
import type {
    AttendanceRecord,
    AttendanceSession,
    UserAttendanceResponse,
    UserEventAttendance,
} from "@/lib/users";
import { attendanceState } from "@/lib/users";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { parseUserRecord, USER_SELECT } from "../../user-api";

export const runtime = "nodejs";

type UserAttendanceContext = {
    params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: UserAttendanceContext) {
    const authUser = await requireApiUser(request);
    if (authUser instanceof Response) return authUser;

    const { id } = await context.params;
    const userId = Number(id);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return Response.json({ error: "Invalid user ID." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const userResult = await admin.from("nu_users").select(USER_SELECT).eq("id", userId).maybeSingle();
    if (userResult.error) return databaseError(userResult.error, "Unable to load the user.");
    if (!userResult.data) return Response.json({ error: "User not found." }, { status: 404 });

    const user = parseUserRecord(userResult.data);
    if (!user.auth_user_id) {
        const emptyResponse: UserAttendanceResponse = { user, attendance: [] };
        return Response.json(emptyResponse);
    }

    const attendeeResult = await admin
        .from("nu_event_attendees")
        .select("id, created_at, user_id, event_id, date_time_first_in, date_time_last_out, date_index, status, session_id")
        .eq("user_id", user.auth_user_id)
        .order("created_at", { ascending: false })
        .limit(2000);
    if (attendeeResult.error) return databaseError(attendeeResult.error, "Unable to load attendance.");

    const records = (attendeeResult.data || []) as AttendanceRecord[];
    const eventIds = [...new Set(records.map((record) => record.event_id))];
    const sessionIds = [...new Set(records.map((record) => record.session_id))];

    const [eventsResult, sessionsResult] = await Promise.all([
        eventIds.length
            ? admin.from("nu_events").select(EVENT_SELECT).in("id", eventIds)
            : Promise.resolve({ data: [], error: null }),
        sessionIds.length
            ? admin
                .from("nu_event_sessions")
                .select(SESSION_SELECT)
                .in("id", sessionIds)
            : Promise.resolve({ data: [], error: null }),
    ]);

    const relationError = eventsResult.error || sessionsResult.error;
    if (relationError) return databaseError(relationError, "Unable to load attended events.");

    const events = (eventsResult.data || []).map(parseEventRecord);
    const sessions = (sessionsResult.data || []) as AttendanceSession[];
    const attendance: UserEventAttendance[] = eventIds.map((eventId) => {
        const eventRecords = records.filter((record) => record.event_id === eventId);
        const checkIns = eventRecords
            .map((record) => record.date_time_first_in)
            .filter((value): value is string => Boolean(value))
            .sort();
        const checkOuts = eventRecords
            .map((record) => record.date_time_last_out)
            .filter((value): value is string => Boolean(value))
            .sort();
        const recordStates = eventRecords.map(attendanceState);
        const state = recordStates.includes("currently_attending")
            ? "currently_attending"
            : recordStates.includes("on_break")
                ? "on_break"
                : recordStates.includes("completed")
                    ? "completed"
                    : recordStates.includes("attended")
                        ? "attended"
                        : "registered";

        return {
            event: events.find((event) => event.id === eventId) || null,
            event_id: eventId,
            state,
            records: eventRecords,
            sessions: sessions.filter((session) =>
                eventRecords.some((record) => record.session_id === session.id),
            ),
            first_check_in: checkIns[0] || null,
            last_check_out: checkOuts.at(-1) || null,
        };
    });
    attendance.sort((left, right) =>
        (right.event?.start_datetime || "").localeCompare(left.event?.start_datetime || ""),
    );

    const response: UserAttendanceResponse = { user, attendance };
    return Response.json(response);
}
