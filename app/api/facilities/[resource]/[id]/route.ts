import { databaseError, requireApiUser } from "@/app/api/api-helpers";
import type { FacilityResource } from "@/lib/facilities";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
    facilityConfigurations,
    isFacilityResource,
    parseFacilityId,
    parseFacilityInput,
    validateFacilityReferences,
} from "../../facility-api";

export const runtime = "nodejs";

type FacilityItemContext = {
    params: Promise<{ resource: string; id: string }>;
};

const dependencies: Partial<Record<FacilityResource, Array<{ table: string; column: string; label: string }>>> = {
    buildings: [
        { table: "nu_floors", column: "building_id", label: "floors" },
        { table: "nu_rooms", column: "building_id", label: "rooms" },
        { table: "nu_event_sessions", column: "session_building_id", label: "sessions" },
    ],
    floors: [
        { table: "nu_rooms", column: "floor_id", label: "rooms" },
        { table: "nu_event_sessions", column: "session_floor_id", label: "sessions" },
    ],
    rooms: [
        { table: "nu_places", column: "room_id", label: "places" },
        { table: "nu_event_sessions", column: "session_room_id", label: "sessions" },
    ],
};

async function routeDetails(context: FacilityItemContext) {
    const params = await context.params;
    if (!isFacilityResource(params.resource)) return null;
    const id = parseFacilityId(params.id);
    return id ? { resource: params.resource, id } : null;
}

export async function PATCH(request: Request, context: FacilityItemContext) {
    const user = await requireApiUser(request);
    if (user instanceof Response) return user;

    const details = await routeDetails(context);
    if (!details) return Response.json({ error: "Invalid facility resource or ID." }, { status: 400 });

    const input = await parseFacilityInput(request, details.resource);
    if (input instanceof Response) return input;

    const referenceError = await validateFacilityReferences(details.resource, input);
    if (referenceError) return referenceError;

    const configuration = facilityConfigurations[details.resource];
    const payload = { ...input, [configuration.updatedAt]: new Date().toISOString() };
    const { data, error } = await getSupabaseAdmin()
        .from(configuration.table)
        .update(payload)
        .eq("id", details.id)
        .select(configuration.select)
        .maybeSingle();

    if (error) return databaseError(error, `Unable to update the ${details.resource.slice(0, -1)}.`);
    if (!data) return Response.json({ error: "Facility record not found." }, { status: 404 });

    return Response.json({ record: data });
}

export async function DELETE(request: Request, context: FacilityItemContext) {
    const user = await requireApiUser(request);
    if (user instanceof Response) return user;

    const details = await routeDetails(context);
    if (!details) return Response.json({ error: "Invalid facility resource or ID." }, { status: 400 });

    const admin = getSupabaseAdmin();
    const checks = dependencies[details.resource] || [];
    const results = await Promise.all(
        checks.map(async (check) => ({
            ...check,
            result: await admin
                .from(check.table)
                .select("id", { count: "exact", head: true })
                .eq(check.column, details.id),
        })),
    );
    const checkError = results.find(({ result }) => result.error)?.result.error;
    if (checkError) return databaseError(checkError, "Unable to check facility dependencies.");

    const usedBy = results
        .filter(({ result }) => (result.count || 0) > 0)
        .map(({ label, result }) => `${result.count} ${label}`);
    if (usedBy.length) {
        return Response.json(
            { error: `Delete related ${usedBy.join(", ")} first.` },
            { status: 409 },
        );
    }

    const configuration = facilityConfigurations[details.resource];
    const { data, error } = await admin
        .from(configuration.table)
        .delete()
        .eq("id", details.id)
        .select(configuration.select)
        .maybeSingle();

    if (error) return databaseError(error, `Unable to delete the ${details.resource.slice(0, -1)}.`);
    if (!data) return Response.json({ error: "Facility record not found." }, { status: 404 });

    return Response.json({ record: data });
}
