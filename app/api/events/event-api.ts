import { z } from "zod";
import { EVENT_STATUSES, type EventRecord } from "@/lib/events";
import { authenticateSupabaseRequest } from "@/lib/supabase/server";

export const EVENT_SELECT =
    "id, created_at, event_name, event_description, qrcode_value, start_datetime, end_datetime, status";

export const eventInputSchema = z
    .object({
        event_name: z.string().trim().min(2, "Event name must be at least 2 characters.").max(160),
        event_description: z.string().trim().min(1, "Description is required.").max(5000),
        qrcode_value: z
            .string()
            .trim()
            .max(2953, "QR code value is too long.")
            .nullable()
            .refine(
                (value) => value === null || new TextEncoder().encode(value).length <= 2953,
                "QR code value is too long to encode.",
            ),
        start_datetime: z.iso.datetime({ offset: true }),
        end_datetime: z.iso.datetime({ offset: true }),
        status: z.enum(EVENT_STATUSES),
    })
    .superRefine((event, context) => {
        if (Date.parse(event.end_datetime) < Date.parse(event.start_datetime)) {
            context.addIssue({
                code: "custom",
                message: "End date must be after the start date.",
                path: ["end_datetime"],
            });
        }
    });

export async function requireEventApiUser(request: Request) {
    const user = await authenticateSupabaseRequest(request);

    if (!user) {
        return Response.json(
            { error: "Your session is missing or expired. Sign in again to manage events." },
            { status: 401 },
        );
    }

    return user;
}

export async function parseEventInput(request: Request) {
    try {
        const result = eventInputSchema.safeParse(await request.json());

        if (!result.success) {
            return Response.json(
                {
                    error: result.error.issues[0]?.message || "Check the event details and try again.",
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

export function parseEventRecord(value: unknown): EventRecord {
    return value as EventRecord;
}

export function eventDatabaseError(error: { message: string }, fallback: string) {
    return Response.json({ error: error.message || fallback }, { status: 500 });
}
