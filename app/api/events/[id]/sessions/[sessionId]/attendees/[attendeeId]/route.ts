import { databaseError } from "@/app/api/api-helpers";
import { requireUserManager } from "@/app/api/users/user-api";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

type AttendeeRouteContext = {
    params: Promise<{ id: string; sessionId: string; attendeeId: string }>;
};

function parseIds(params: Awaited<AttendeeRouteContext["params"]>) {
    const eventId = Number(params.id);
    const sessionId = Number(params.sessionId);
    const attendeeId = Number(params.attendeeId);

    return [eventId, sessionId, attendeeId].every(
        (value) => Number.isSafeInteger(value) && value > 0,
    )
        ? { eventId, sessionId, attendeeId }
        : null;
}

export async function DELETE(request: Request, context: AttendeeRouteContext) {
    const manager = await requireUserManager(request);
    if (manager instanceof Response) return manager;

    const ids = parseIds(await context.params);
    if (!ids) {
        return Response.json(
            { error: "Invalid event, session, or attendee ID." },
            { status: 400 },
        );
    }

    const admin = getSupabaseAdmin();
    const [sessionResult, attendeeResult] = await Promise.all([
        admin
            .from("nu_event_sessions")
            .select("id")
            .eq("id", ids.sessionId)
            .eq("session_event_id", ids.eventId)
            .maybeSingle(),
        admin
            .from("nu_event_attendees")
            .select("id, user_id")
            .eq("id", ids.attendeeId)
            .eq("event_id", ids.eventId)
            .eq("session_id", ids.sessionId)
            .maybeSingle(),
    ]);
    const lookupError = sessionResult.error || attendeeResult.error;
    if (lookupError) return databaseError(lookupError, "Unable to load the attendee registration.");
    if (!sessionResult.data || !attendeeResult.data) {
        return Response.json(
            { error: "The session or attendee registration was not found." },
            { status: 404 },
        );
    }

    const userId = attendeeResult.data.user_id as string | null;
    if (!userId) {
        return Response.json(
            { error: "This attendee record has no user ID, so its related logs cannot be removed safely." },
            { status: 409 },
        );
    }

    const logDeletion = await admin
        .from("nu_event_attendees_log")
        .delete({ count: "exact" })
        .eq("event_id", ids.eventId)
        .eq("session_id", ids.sessionId)
        .eq("user_id", userId);
    if (logDeletion.error) {
        return databaseError(logDeletion.error, "Unable to remove the attendee activity logs.");
    }

    const attendeeDeletion = await admin
        .from("nu_event_attendees")
        .delete({ count: "exact" })
        .eq("event_id", ids.eventId)
        .eq("session_id", ids.sessionId)
        .eq("user_id", userId);
    if (attendeeDeletion.error) {
        return Response.json(
            {
                error: "Activity logs were removed, but the attendee registration could not be deleted. Retry unregistering to finish.",
            },
            { status: 502 },
        );
    }

    return Response.json({
        unregisteredUserId: userId,
        eventId: ids.eventId,
        sessionId: ids.sessionId,
        deletedAttendanceRecords: attendeeDeletion.count || 0,
        deletedLogRecords: logDeletion.count || 0,
    });
}
