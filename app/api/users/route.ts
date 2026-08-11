import { databaseError, requireApiUser } from "@/app/api/api-helpers";
import { getSupabaseAdmin, insertWithIdentityRecovery } from "@/lib/supabase/server";
import {
    parseUserCreateInput,
    parseUserRecord,
    requireUserManager,
    USER_SELECT,
} from "./user-api";

export const runtime = "nodejs";

const USER_PAGE_SIZE = 1000;
const MAX_USERS = 100_000;

export async function GET(request: Request) {
    const user = await requireApiUser(request);
    if (user instanceof Response) return user;

    const admin = getSupabaseAdmin();
    const firstPage = await admin
        .from("nu_users")
        .select(USER_SELECT, { count: "exact" })
        .order("id", { ascending: false })
        .range(0, USER_PAGE_SIZE - 1);

    if (firstPage.error) return databaseError(firstPage.error, "Unable to load users.");

    const total = firstPage.count || 0;
    if (total > MAX_USERS) {
        return Response.json(
            { error: "There are too many users to load safely in one request." },
            { status: 503 },
        );
    }

    const rows: unknown[] = [...(firstPage.data || [])];
    while (rows.length < total) {
        const nextPage = await admin
            .from("nu_users")
            .select(USER_SELECT)
            .order("id", { ascending: false })
            .range(rows.length, Math.min(rows.length + USER_PAGE_SIZE - 1, total - 1));

        if (nextPage.error) return databaseError(nextPage.error, "Unable to load users.");
        if (!nextPage.data?.length) {
            return Response.json({ error: "The complete user list could not be loaded." }, { status: 502 });
        }
        rows.push(...nextPage.data);
    }

    return Response.json({ users: rows.map(parseUserRecord) });
}

function authCreationError(error: { message: string; status?: number }) {
    const message = error.message.toLowerCase();
    if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
        return Response.json(
            { error: "A Supabase Authentication user already exists with this email." },
            { status: 409 },
        );
    }

    if (error.status === 422 || message.includes("password") || message.includes("email")) {
        return Response.json({ error: error.message }, { status: 422 });
    }

    return Response.json({ error: "Unable to create the Supabase Authentication user." }, { status: 500 });
}

export async function POST(request: Request) {
    const manager = await requireUserManager(request);
    if (manager instanceof Response) return manager;

    const input = await parseUserCreateInput(request);
    if (input instanceof Response) return input;

    const admin = getSupabaseAdmin();
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: {
            username: input.username,
            firstname: input.firstname,
            lastname: input.lastname,
            middlename: input.middlename,
            middle_name: input.middlename,
            ext: input.ext,
            phone: input.phone,
            phone_number: input.phone,
        },
        app_metadata: {
            nu_role: input.role,
        },
    });
    if (authError) return authCreationError(authError);
    if (!authData.user) {
        return Response.json({ error: "Supabase did not return the created authentication user." }, { status: 500 });
    }

    const now = new Date().toISOString();
    const profileValues = {
        username: input.username,
        email: input.email,
        role: input.role,
        firstname: input.firstname,
        lastname: input.lastname,
        middlename: input.middlename,
        ext: input.ext,
        phone: input.phone,
        is_active: 1,
        "userID": authData.user.id,
        user_qr_code: authData.user.id,
        date_time_email_confirmed: authData.user.email_confirmed_at || now,
    };
    const existingProfile = await admin
        .from("nu_users")
        .select("id")
        .eq("userID", authData.user.id)
        .limit(1)
        .maybeSingle();

    if (existingProfile.error) {
        await admin.auth.admin.deleteUser(authData.user.id);
        return databaseError(existingProfile.error, "Unable to verify the new user profile.");
    }

    const profileResult = existingProfile.data
        ? await admin
            .from("nu_users")
            .update(profileValues)
            .eq("id", existingProfile.data.id)
            .select(USER_SELECT)
            .single()
        : await insertWithIdentityRecovery(
            "nu_users",
            { ...profileValues, created_at: now },
            USER_SELECT,
        );

    if (profileResult.error) {
        await admin.auth.admin.deleteUser(authData.user.id);
        return databaseError(profileResult.error, "Unable to create the user profile.");
    }

    return Response.json({ user: parseUserRecord(profileResult.data) }, { status: 201 });
}
