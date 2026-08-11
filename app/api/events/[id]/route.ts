import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
    EVENT_SELECT,
    eventDatabaseError,
    parseEventInput,
    parseEventRecord,
    requireEventApiUser,
} from "../event-api";

export const runtime = "nodejs";

type EventRouteContext = {
    params: Promise<{ id: string }>;
};

async function getEventId(context: EventRouteContext) {
    const { id } = await context.params;
    const eventId = Number(id);
    return Number.isSafeInteger(eventId) && eventId > 0 ? eventId : null;
}

export async function PATCH(request: Request, context: EventRouteContext) {
    const user = await requireEventApiUser(request);
    if (user instanceof Response) return user;

    const eventId = await getEventId(context);
    if (!eventId) return Response.json({ error: "Invalid event ID." }, { status: 400 });

    const input = await parseEventInput(request);
    if (input instanceof Response) return input;

    const { data, error } = await getSupabaseAdmin()
        .from("nu_events")
        .update(input)
        .eq("id", eventId)
        .select(EVENT_SELECT)
        .maybeSingle();

    if (error) return eventDatabaseError(error, "Unable to update the event.");
    if (!data) return Response.json({ error: "Event not found." }, { status: 404 });

    return Response.json({ event: parseEventRecord(data) });
}

export async function DELETE(request: Request, context: EventRouteContext) {
    const user = await requireEventApiUser(request);
    if (user instanceof Response) return user;

    const eventId = await getEventId(context);
    if (!eventId) return Response.json({ error: "Invalid event ID." }, { status: 400 });

    const admin = getSupabaseAdmin();
    const existingEvent = await admin
        .from("nu_events")
        .select("id")
        .eq("id", eventId)
        .maybeSingle();

    if (existingEvent.error) {
        return eventDatabaseError(existingEvent.error, "Unable to find the event.");
    }
    if (!existingEvent.data) {
        return Response.json({ error: "Event not found." }, { status: 404 });
    }

    const sessionsResult = await admin
        .from("nu_event_sessions")
        .delete()
        .eq("session_event_id", eventId)
        .select("id");

    if (sessionsResult.error) {
        return eventDatabaseError(
            sessionsResult.error,
            "Unable to delete the sessions related to this event.",
        );
    }

    const { data, error } = await admin
        .from("nu_events")
        .delete()
        .eq("id", eventId)
        .select(EVENT_SELECT)
        .maybeSingle();

    if (error) return eventDatabaseError(error, "Unable to delete the event.");
    if (!data) return Response.json({ error: "Event not found." }, { status: 404 });

    return Response.json({
        event: parseEventRecord(data),
        deletedSessionCount: sessionsResult.data?.length || 0,
    });
}
