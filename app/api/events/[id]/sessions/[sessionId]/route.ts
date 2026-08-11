import { getSupabaseAdmin } from "@/lib/supabase/server";
import { eventDatabaseError, requireEventApiUser } from "../../../event-api";
import {
    SESSION_SELECT,
    parseSessionInput,
    parseSessionRecord,
    validateSessionLocation,
} from "../session-api";

export const runtime = "nodejs";

type SessionRouteContext = {
    params: Promise<{ id: string; sessionId: string }>;
};

async function getRouteIds(context: SessionRouteContext) {
    const params = await context.params;
    const eventId = Number(params.id);
    const sessionId = Number(params.sessionId);

    if (
        !Number.isSafeInteger(eventId) ||
        eventId <= 0 ||
        !Number.isSafeInteger(sessionId) ||
        sessionId <= 0
    ) {
        return null;
    }

    return { eventId, sessionId };
}

export async function PATCH(request: Request, context: SessionRouteContext) {
    const user = await requireEventApiUser(request);
    if (user instanceof Response) return user;

    const ids = await getRouteIds(context);
    if (!ids) return Response.json({ error: "Invalid event or session ID." }, { status: 400 });

    const input = await parseSessionInput(request);
    if (input instanceof Response) return input;

    const locationError = await validateSessionLocation(input);
    if (locationError) return locationError;

    const { data, error } = await getSupabaseAdmin()
        .from("nu_event_sessions")
        .update(input)
        .eq("id", ids.sessionId)
        .eq("session_event_id", ids.eventId)
        .select(SESSION_SELECT)
        .maybeSingle();

    if (error) return eventDatabaseError(error, "Unable to update the session.");
    if (!data) return Response.json({ error: "Session not found for this event." }, { status: 404 });

    return Response.json({ session: parseSessionRecord(data) });
}

export async function DELETE(request: Request, context: SessionRouteContext) {
    const user = await requireEventApiUser(request);
    if (user instanceof Response) return user;

    const ids = await getRouteIds(context);
    if (!ids) return Response.json({ error: "Invalid event or session ID." }, { status: 400 });

    const { data, error } = await getSupabaseAdmin()
        .from("nu_event_sessions")
        .delete()
        .eq("id", ids.sessionId)
        .eq("session_event_id", ids.eventId)
        .select(SESSION_SELECT)
        .maybeSingle();

    if (error) return eventDatabaseError(error, "Unable to delete the session.");
    if (!data) return Response.json({ error: "Session not found for this event." }, { status: 404 });

    return Response.json({ session: parseSessionRecord(data) });
}
