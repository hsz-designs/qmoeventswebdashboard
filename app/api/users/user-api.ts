import { z } from "zod";
import { databaseError, requireApiUser } from "@/app/api/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { UserRecord } from "@/lib/users";

export const USER_SELECT = [
    "id",
    "created_at",
    "username",
    "email",
    "role",
    "firstname",
    "lastname",
    "middlename",
    "ext",
    "phone",
    "is_active",
    "user_qr_code",
    "userID",
].join(", ");

const nullableText = (maximum: number) => z.string().trim().max(maximum).nullable();

export const userCreateSchema = z.object({
    email: z.email("Enter a valid email address.").transform((value) => value.toLowerCase()),
    password: z.string().min(8, "Password must contain at least 8 characters.").max(128),
    username: nullableText(100),
    firstname: nullableText(150),
    lastname: nullableText(150),
    middlename: nullableText(150),
    ext: nullableText(30),
    phone: nullableText(50),
    role: z.union([z.literal(1), z.literal(2)]),
});

export const userUpdateSchema = userCreateSchema
    .omit({ password: true })
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
        message: "Provide at least one user field to update.",
    });

type RawUserRecord = Omit<UserRecord, "auth_user_id"> & {
    userID: string | null;
};

export function parseUserRecord(value: unknown): UserRecord {
    const raw = value as RawUserRecord;
    const { userID, ...user } = raw;
    return { ...user, auth_user_id: userID };
}

export async function parseUserCreateInput(request: Request) {
    try {
        const result = userCreateSchema.safeParse(await request.json());
        if (result.success) return result.data;

        return Response.json(
            {
                error: result.error.issues[0]?.message || "Check the user details and try again.",
                fields: z.flattenError(result.error).fieldErrors,
            },
            { status: 422 },
        );
    } catch {
        return Response.json({ error: "The request body must be valid JSON." }, { status: 400 });
    }
}

export async function parseUserUpdateInput(request: Request) {
    try {
        const result = userUpdateSchema.safeParse(await request.json());
        if (result.success) return result.data;

        return Response.json(
            {
                error: result.error.issues[0]?.message || "Check the user details and try again.",
                fields: z.flattenError(result.error).fieldErrors,
            },
            { status: 422 },
        );
    } catch {
        return Response.json({ error: "The request body must be valid JSON." }, { status: 400 });
    }
}

export async function requireUserManager(request: Request) {
    const authUser = await requireApiUser(request);
    if (authUser instanceof Response) return authUser;

    const admin = getSupabaseAdmin();
    const existingAdmin = await admin
        .from("nu_users")
        .select("id")
        .eq("role", 2)
        .not("userID", "is", null)
        .limit(1)
        .maybeSingle();
    if (existingAdmin.error) {
        return databaseError(existingAdmin.error, "Unable to verify user-management access.");
    }

    // Imported installations may not have a role-2 profile yet. Allow an
    // authenticated bootstrap only until the first administrator is assigned.
    if (!existingAdmin.data) return authUser;

    const managerProfile = await admin
        .from("nu_users")
        .select("id, role")
        .eq("userID", authUser.id)
        .eq("role", 2)
        .limit(1)
        .maybeSingle();
    if (managerProfile.error) {
        return databaseError(managerProfile.error, "Unable to verify administrator access.");
    }
    if (!managerProfile.data) {
        return Response.json(
            { error: "Only role 2 administrators can manage users." },
            { status: 403 },
        );
    }

    return authUser;
}
