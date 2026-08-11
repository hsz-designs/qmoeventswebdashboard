import { databaseError, requireApiUser } from "@/app/api/api-helpers";
import type { FacilityData } from "@/lib/facilities";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { facilityConfigurations } from "./facility-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
    const user = await requireApiUser(request);
    if (user instanceof Response) return user;

    const admin = getSupabaseAdmin();
    const [buildings, departments, floors, rooms, places] = await Promise.all([
        admin.from("nu_buildings").select(facilityConfigurations.buildings.select).order("building_name").limit(2000),
        admin.from("nu_departments").select(facilityConfigurations.departments.select).order("department_name").limit(2000),
        admin.from("nu_floors").select(facilityConfigurations.floors.select).order("floor_name").limit(2000),
        admin.from("nu_rooms").select(facilityConfigurations.rooms.select).order("room_no").limit(2000),
        admin.from("nu_places").select(facilityConfigurations.places.select).order("place_name").limit(2000),
    ]);
    const error = buildings.error || departments.error || floors.error || rooms.error || places.error;
    if (error) return databaseError(error, "Unable to load facilities.");

    const response: FacilityData = {
        buildings: buildings.data || [],
        departments: departments.data || [],
        floors: floors.data || [],
        rooms: rooms.data || [],
        places: places.data || [],
    };

    return Response.json(response);
}
