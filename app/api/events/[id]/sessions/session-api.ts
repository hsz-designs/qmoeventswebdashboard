import { z } from "zod";
import type { EventSessionRecord } from "@/lib/event-sessions";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const SESSION_SELECT = [
    "id",
    "created_at",
    "session_topic",
    "session_speaker_id",
    "session_date",
    "session_start_time",
    "session_end_time",
    "session_building_id",
    "session_floor_id",
    "session_room_id",
    "session_event_id",
    "session_type",
    "session_max_capacity",
    "status",
].join(", ");

export const sessionInputSchema = z
    .object({
        session_topic: z.string().trim().min(2, "Session topic must be at least 2 characters.").max(300),
        session_speaker_id: z.string().trim().max(200).nullable(),
        session_date: z.iso.date(),
        session_start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Choose a valid start time."),
        session_end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Choose a valid end time."),
        session_building_id: z.number().int().positive(),
        session_floor_id: z.number().int().positive(),
        session_room_id: z.number().int().positive(),
        session_type: z.union([z.literal(1), z.literal(2)], {
            error: "Choose On-site meeting or Online meeting.",
        }),
        session_max_capacity: z.number().int().positive().nullable(),
        status: z.union([z.literal(0), z.literal(1)], {
            error: "Choose Visible or Invisible / inactive.",
        }),
    })
    .superRefine((session, context) => {
        if (session.session_end_time <= session.session_start_time) {
            context.addIssue({
                code: "custom",
                message: "End time must be after the start time.",
                path: ["session_end_time"],
            });
        }
    });

export async function parseSessionInput(request: Request) {
    try {
        const result = sessionInputSchema.safeParse(await request.json());

        if (!result.success) {
            return Response.json(
                {
                    error: result.error.issues[0]?.message || "Check the session details and try again.",
                    fields: z.flattenError(result.error).fieldErrors,
                },
                { status: 422 },
            );
        }

        return result.data;
    } catch {
        return Response.json({ error: "The request body must be valid JSON." }, { status: 400 });
    }
}

export async function validateSessionLocation(input: z.infer<typeof sessionInputSchema>) {
    const { data, error } = await getSupabaseAdmin()
        .from("nu_rooms")
        .select("id, building_id, floor_id")
        .eq("id", input.session_room_id)
        .maybeSingle();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    if (!data) {
        return Response.json({ error: "The selected room no longer exists." }, { status: 422 });
    }

    if (data.building_id !== input.session_building_id || data.floor_id !== input.session_floor_id) {
        return Response.json(
            { error: "The selected room does not belong to that building and floor." },
            { status: 422 },
        );
    }

    return null;
}

export function parseSessionRecord(value: unknown): EventSessionRecord {
    return value as EventSessionRecord;
}
