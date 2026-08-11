import { authenticateSupabaseRequest } from "@/lib/supabase/server";

export async function requireApiUser(request: Request) {
    const user = await authenticateSupabaseRequest(request);

    if (!user) {
        return Response.json(
            { error: "Your session is missing or expired. Sign in again to continue." },
            { status: 401 },
        );
    }

    return user;
}

export function databaseError(error: { code?: string; message: string }, fallback: string) {
    if (error.code === "23505") {
        const primaryKeyCollision = error.message.includes("_pkey");
        return Response.json(
            {
                error: primaryKeyCollision
                    ? "The database could not assign a unique ID. Please retry the request."
                    : "A record with the same unique value already exists.",
            },
            { status: 409 },
        );
    }

    if (error.code === "23503") {
        return Response.json(
            { error: "This record is still connected to another record and cannot be changed yet." },
            { status: 409 },
        );
    }

    return Response.json({ error: fallback }, { status: 500 });
}
