import type { EventSessionsResponse } from "@/lib/event-sessions";
import { getSupabaseAdmin, insertWithIdentityRecovery } from "@/lib/supabase/server";
import {
    EVENT_SELECT,
    eventDatabaseError,
    parseEventRecord,
    requireEventApiUser,
} from "../../event-api";
import {
    SESSION_SELECT,
    parseSessionInput,
    parseSessionRecord,
    validateSessionLocation,
} from "./session-api";

export const runtime = "nodejs";

type EventSessionsContext = {
    params: Promise<{ id: string }>;
};

async function getEventId(context: EventSessionsContext) {
    const { id } = await context.params;
    const eventId = Number(id);
    return Number.isSafeInteger(eventId) && eventId > 0 ? eventId : null;
}

export async function GET(request: Request, context: EventSessionsContext) {
    const user = await requireEventApiUser(request);
    if (user instanceof Response) return user;

    const eventId = await getEventId(context);
    if (!eventId) return Response.json({ error: "Invalid event ID." }, { status: 400 });

    const admin = getSupabaseAdmin();
    const [eventResult, sessionsResult, buildingsResult, floorsResult, roomsResult] = await Promise.all([
        admin.from("nu_events").select(EVENT_SELECT).eq("id", eventId).maybeSingle(),
        admin
            .from("nu_event_sessions")
            .select(SESSION_SELECT)
            .eq("session_event_id", eventId)
            .order("session_date", { ascending: true })
            .order("session_start_time", { ascending: true }),
        admin.from("nu_buildings").select("id, building_name").order("building_name").limit(2000),
        admin.from("nu_floors").select("id, building_id, floor_name").order("floor_name").limit(2000),
        admin
            .from("nu_rooms")
            .select("id, building_id, floor_id, room_no, room_max_capacity")
            .order("room_no")
            .limit(2000),
    ]);

    const databaseError =
        eventResult.error ||
        sessionsResult.error ||
        buildingsResult.error ||
        floorsResult.error ||
        roomsResult.error;
    if (databaseError) return eventDatabaseError(databaseError, "Unable to load event sessions.");
    if (!eventResult.data) return Response.json({ error: "Event not found." }, { status: 404 });

    const response: EventSessionsResponse = {
        event: parseEventRecord(eventResult.data),
        sessions: (sessionsResult.data || []).map(parseSessionRecord),
        locations: {
            buildings: buildingsResult.data || [],
            floors: floorsResult.data || [],
            rooms: roomsResult.data || [],
        },
    };

    return Response.json(response);
}

export async function POST(request: Request, context: EventSessionsContext) {
    const user = await requireEventApiUser(request);
    if (user instanceof Response) return user;

    const eventId = await getEventId(context);
    if (!eventId) return Response.json({ error: "Invalid event ID." }, { status: 400 });

    const input = await parseSessionInput(request);
    if (input instanceof Response) return input;

    const locationError = await validateSessionLocation(input);
    if (locationError) return locationError;

    const { data, error } = await insertWithIdentityRecovery(
        "nu_event_sessions",
        { ...input, session_event_id: eventId },
        SESSION_SELECT,
    );

    if (error) return eventDatabaseError(error, "Unable to create the session.");

    return Response.json({ session: parseSessionRecord(data) }, { status: 201 });
}
