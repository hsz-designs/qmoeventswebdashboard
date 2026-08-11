import { getSupabaseAdmin, insertWithIdentityRecovery } from "@/lib/supabase/server";
import {
    EVENT_SELECT,
    eventDatabaseError,
    parseEventInput,
    parseEventRecord,
    requireEventApiUser,
} from "./event-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
    const user = await requireEventApiUser(request);
    if (user instanceof Response) return user;

    const { data, error } = await getSupabaseAdmin()
        .from("nu_events")
        .select(EVENT_SELECT)
        .order("start_datetime", { ascending: false });

    if (error) return eventDatabaseError(error, "Unable to load events.");

    return Response.json({ events: (data || []).map(parseEventRecord) });
}

export async function POST(request: Request) {
    const user = await requireEventApiUser(request);
    if (user instanceof Response) return user;

    const input = await parseEventInput(request);
    if (input instanceof Response) return input;

    const { data, error } = await insertWithIdentityRecovery(
        "nu_events",
        input,
        EVENT_SELECT,
    );

    if (error) return eventDatabaseError(error, "Unable to create the event.");

    return Response.json({ event: parseEventRecord(data) }, { status: 201 });
}
