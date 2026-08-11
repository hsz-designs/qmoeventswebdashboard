import { databaseError } from "@/app/api/api-helpers";
import type { CalendarSessionRecord } from "@/lib/calendar-events";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const CALENDAR_SESSION_SELECT = [
    "id",
    "session_topic",
    "session_date",
    "session_start_time",
    "session_end_time",
    "session_event_id",
    "session_type",
    "status",
].join(", ");

type CalendarSessionRow = Omit<CalendarSessionRecord, "event">;

type CalendarEventRow = {
    id: number;
    event_name: string;
};

function lastDateOfMonth(year: number, monthNumber: number) {
    return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const month = requestUrl.searchParams.get("month");
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        return Response.json({ error: "Provide a valid month in YYYY-MM format." }, { status: 400 });
    }

    const [year, monthNumber] = month.split("-").map(Number);
    const rangeStart = `${month}-01`;
    const rangeEnd = lastDateOfMonth(year, monthNumber);
    const admin = getSupabaseAdmin();
    const sessionsResult = await admin
        .from("nu_event_sessions")
        .select(CALENDAR_SESSION_SELECT)
        .gte("session_date", rangeStart)
        .lte("session_date", rangeEnd)
        .eq("status", 1)
        .order("session_date", { ascending: true })
        .order("session_start_time", { ascending: true })
        .limit(5000);

    if (sessionsResult.error) {
        return databaseError(sessionsResult.error, "Unable to load calendar sessions.");
    }

    const sessions = (sessionsResult.data || []) as unknown as CalendarSessionRow[];
    const eventIds = [...new Set(sessions.map((session) => session.session_event_id))];
    const eventsResult = eventIds.length
        ? await admin.from("nu_events").select("id, event_name").in("id", eventIds)
        : { data: [] as CalendarEventRow[], error: null };

    if (eventsResult.error) {
        return databaseError(eventsResult.error, "Unable to load event names for calendar sessions.");
    }

    const eventNames = new Map(
        ((eventsResult.data || []) as CalendarEventRow[]).map((event) => [event.id, event]),
    );
    const calendarSessions: CalendarSessionRecord[] = sessions.flatMap((session) => {
        const event = eventNames.get(session.session_event_id);
        return event ? [{ ...session, event }] : [];
    });

    return Response.json({ sessions: calendarSessions });
}
