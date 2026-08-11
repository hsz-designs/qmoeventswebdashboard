import { databaseError, requireApiUser } from "@/app/api/api-helpers";
import type { DashboardOverview } from "@/lib/dashboard-overview";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
    const user = await requireApiUser(request);
    if (user instanceof Response) return user;

    const admin = getSupabaseAdmin();
    const now = new Date().toISOString();
    const [usersResult, eventsResult, upcomingResult] = await Promise.all([
        admin.from("nu_users").select("id", { count: "exact", head: true }),
        admin.from("nu_events").select("id", { count: "exact", head: true }),
        admin
            .from("nu_events")
            .select("id", { count: "exact", head: true })
            .gte("start_datetime", now)
            .neq("status", "cancelled"),
    ]);
    const error = usersResult.error || eventsResult.error || upcomingResult.error;
    if (error) return databaseError(error, "Unable to load overview figures.");

    const overview: DashboardOverview = {
        users: usersResult.count || 0,
        events: eventsResult.count || 0,
        upcoming_events: upcomingResult.count || 0,
    };

    return Response.json(overview);
}
