import { databaseError, requireApiUser } from "@/app/api/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ATTENDANCE_PAGE_SIZE = 1000;
const MAX_ATTENDANCE_RECORDS = 100_000;

type AttendanceStatusRow = {
    id: number;
    user_id: string | null;
    date_time_first_in: string | null;
};

export async function GET(request: Request) {
    const user = await requireApiUser(request);
    if (user instanceof Response) return user;

    const eventId = Number(new URL(request.url).searchParams.get("eventId"));
    if (!Number.isSafeInteger(eventId) || eventId <= 0) {
        return Response.json({ error: "Choose a valid event." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const firstPage = await admin
        .from("nu_event_attendees")
        .select("id, user_id, date_time_first_in", { count: "exact" })
        .eq("event_id", eventId)
        .order("id", { ascending: true })
        .range(0, ATTENDANCE_PAGE_SIZE - 1);
    if (firstPage.error) {
        return databaseError(firstPage.error, "Unable to load certificate attendance status.");
    }

    const total = firstPage.count || 0;
    if (total > MAX_ATTENDANCE_RECORDS) {
        return Response.json(
            { error: "This event has too many attendance records to process safely." },
            { status: 503 },
        );
    }

    const rows = [...(firstPage.data || [])] as AttendanceStatusRow[];
    while (rows.length < total) {
        const nextPage = await admin
            .from("nu_event_attendees")
            .select("id, user_id, date_time_first_in")
            .eq("event_id", eventId)
            .order("id", { ascending: true })
            .range(rows.length, Math.min(rows.length + ATTENDANCE_PAGE_SIZE - 1, total - 1));
        if (nextPage.error) {
            return databaseError(nextPage.error, "Unable to load certificate attendance status.");
        }
        if (!nextPage.data?.length) {
            return Response.json(
                { error: "The complete attendance list could not be loaded." },
                { status: 502 },
            );
        }
        rows.push(...nextPage.data as AttendanceStatusRow[]);
    }

    const attendedUserIds = [...new Set(
        rows
            .filter((row) => Boolean(row.date_time_first_in))
            .map((row) => row.user_id)
            .filter((userId): userId is string => Boolean(userId)),
    )];
    const attended = new Set(attendedUserIds);
    const registeredUserIds = [...new Set(
        rows
            .map((row) => row.user_id)
            .filter((userId): userId is string => Boolean(userId) && !attended.has(userId as string)),
    )];
    return Response.json({ attendedUserIds, registeredUserIds });
}
