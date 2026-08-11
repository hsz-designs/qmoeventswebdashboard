import { z } from "zod";
import { databaseError } from "@/app/api/api-helpers";
import type { FacilityResource } from "@/lib/facilities";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const nullableText = (maximum: number) => z.string().trim().max(maximum).nullable();

export const facilityConfigurations = {
    buildings: {
        table: "nu_buildings",
        select: "id, created_at, building_name, address",
        updatedAt: "date_time_last_updated",
        schema: z.object({
            building_name: z.string().trim().min(2, "Building name must be at least 2 characters.").max(200),
            address: nullableText(500),
        }),
    },
    departments: {
        table: "nu_departments",
        select: "id, created_at, department_name",
        updatedAt: "last_updated_date_time",
        schema: z.object({
            department_name: z.string().trim().min(2, "Department name must be at least 2 characters.").max(200),
        }),
    },
    floors: {
        table: "nu_floors",
        select: "id, created_at, building_id, floor_name",
        updatedAt: "date_time_last_updated",
        schema: z.object({
            building_id: z.number().int().positive(),
            floor_name: z.string().trim().min(1, "Floor name is required.").max(160),
        }),
    },
    rooms: {
        table: "nu_rooms",
        select: "id, created_at, room_no, building_id, floor_id, room_max_capacity",
        updatedAt: "date_time_last_updated",
        schema: z.object({
            room_no: z.string().trim().min(1, "Room number or name is required.").max(120),
            building_id: z.number().int().positive(),
            floor_id: z.number().int().positive(),
            room_max_capacity: z.number().int().positive().nullable(),
        }),
    },
    places: {
        table: "nu_places",
        select: "id, created_at, place_name, room_id, department_id, direction",
        updatedAt: "date_time_last_updated",
        schema: z.object({
            place_name: z.string().trim().min(2, "Place name must be at least 2 characters.").max(200),
            room_id: z.number().int().positive(),
            department_id: z.number().int().positive().nullable(),
            direction: nullableText(1000),
        }),
    },
} as const;

export function isFacilityResource(value: string): value is FacilityResource {
    return value in facilityConfigurations;
}

export async function parseFacilityInput(request: Request, resource: FacilityResource) {
    try {
        const result = facilityConfigurations[resource].schema.safeParse(await request.json());

        if (!result.success) {
            return Response.json(
                {
                    error: result.error.issues[0]?.message || "Check the facility details and try again.",
                },
                { status: 422 },
            );
        }

        return result.data as Record<string, string | number | null>;
    } catch {
        return Response.json({ error: "The request body must be valid JSON." }, { status: 400 });
    }
}

export async function validateFacilityReferences(
    resource: FacilityResource,
    input: Record<string, string | number | null>,
) {
    const admin = getSupabaseAdmin();

    if (resource === "floors") {
        const result = await admin
            .from("nu_buildings")
            .select("id")
            .eq("id", Number(input.building_id))
            .maybeSingle();
        if (result.error) return databaseError(result.error, "Unable to validate the building.");
        if (!result.data) return Response.json({ error: "The selected building no longer exists." }, { status: 422 });
    }

    if (resource === "rooms") {
        const result = await admin
            .from("nu_floors")
            .select("id, building_id")
            .eq("id", Number(input.floor_id))
            .maybeSingle();
        if (result.error) return databaseError(result.error, "Unable to validate the floor.");
        if (!result.data) return Response.json({ error: "The selected floor no longer exists." }, { status: 422 });
        if (result.data.building_id !== input.building_id) {
            return Response.json({ error: "The selected floor does not belong to that building." }, { status: 422 });
        }
    }

    if (resource === "places") {
        const roomResult = await admin
            .from("nu_rooms")
            .select("id")
            .eq("id", Number(input.room_id))
            .maybeSingle();
        if (roomResult.error) return databaseError(roomResult.error, "Unable to validate the room.");
        if (!roomResult.data) return Response.json({ error: "The selected room no longer exists." }, { status: 422 });

        if (input.department_id !== null) {
            const departmentResult = await admin
                .from("nu_departments")
                .select("id")
                .eq("id", Number(input.department_id))
                .maybeSingle();
            if (departmentResult.error) return databaseError(departmentResult.error, "Unable to validate the department.");
            if (!departmentResult.data) return Response.json({ error: "The selected department no longer exists." }, { status: 422 });
        }
    }

    return null;
}

export function parseFacilityId(value: string) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}
