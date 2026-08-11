import { databaseError } from "@/app/api/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
    parseUserRecord,
    parseUserUpdateInput,
    requireUserManager,
    USER_SELECT,
} from "../user-api";

export const runtime = "nodejs";

type UserRouteContext = {
    params: Promise<{ id: string }>;
};

const AUTH_USERS_PAGE_SIZE = 1000;
const MAX_AUTH_USER_PAGES = 100;

function normalizeEmail(email: string | undefined) {
    return email?.trim().toLowerCase() || null;
}

async function findAuthenticationUserIdByEmail(
    email: string,
    linkedUserId: string | null,
) {
    const admin = getSupabaseAdmin();
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
        return Response.json(
            { error: "The user profile does not have a valid email address." },
            { status: 409 },
        );
    }

    // Prefer the stored UUID when it still belongs to the same email. Imported
    // profiles may have a missing or stale userID, so email remains the source
    // of truth for destructive Authentication changes.
    if (linkedUserId) {
        const linkedUser = await admin.auth.admin.getUserById(linkedUserId);
        if (
            !linkedUser.error &&
            linkedUser.data.user &&
            normalizeEmail(linkedUser.data.user.email) === normalizedEmail
        ) {
            return linkedUser.data.user.id;
        }
    }

    for (let page = 1; page <= MAX_AUTH_USER_PAGES; page += 1) {
        const authUsers = await admin.auth.admin.listUsers({
            page,
            perPage: AUTH_USERS_PAGE_SIZE,
        });
        if (authUsers.error) {
            return Response.json(
                { error: "Unable to find the matching Supabase Authentication user." },
                { status: 502 },
            );
        }

        const matchingUser = authUsers.data.users.find(
            (candidate) => normalizeEmail(candidate.email) === normalizedEmail,
        );
        if (matchingUser) return matchingUser.id;
        if (authUsers.data.users.length < AUTH_USERS_PAGE_SIZE) return null;
    }

    return Response.json(
        { error: "Unable to safely search all Supabase Authentication users." },
        { status: 502 },
    );
}

export async function PATCH(request: Request, context: UserRouteContext) {
    const manager = await requireUserManager(request);
    if (manager instanceof Response) return manager;

    const { id } = await context.params;
    const userId = Number(id);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return Response.json({ error: "Invalid user ID." }, { status: 400 });
    }

    const input = await parseUserUpdateInput(request);
    if (input instanceof Response) return input;

    const admin = getSupabaseAdmin();
    const currentProfile = await admin
        .from("nu_users")
        .select(USER_SELECT)
        .eq("id", userId)
        .maybeSingle();
    if (currentProfile.error) return databaseError(currentProfile.error, "Unable to load the user.");
    if (!currentProfile.data) return Response.json({ error: "User not found." }, { status: 404 });

    const previous = parseUserRecord(currentProfile.data);
    const authUserId = await findAuthenticationUserIdByEmail(
        previous.email,
        previous.auth_user_id,
    );
    if (authUserId instanceof Response) return authUserId;

    const profileValues: Record<string, unknown> = { ...input };
    if (authUserId) {
        profileValues.userID = authUserId;
        profileValues.user_qr_code = authUserId;
    }
    const rollbackValues = Object.fromEntries(
        Object.keys(profileValues).map((key) => [
            key,
            key === "userID" ? previous.auth_user_id : previous[key as keyof typeof previous],
        ]),
    );
    const updatedProfile = await admin
        .from("nu_users")
        .update(profileValues)
        .eq("id", userId)
        .select(USER_SELECT)
        .single();
    if (updatedProfile.error) {
        return databaseError(updatedProfile.error, "Unable to update the user.");
    }

    if (authUserId) {
        const authResult = await admin.auth.admin.getUserById(authUserId);
        if (authResult.error || !authResult.data.user) {
            await admin.from("nu_users").update(rollbackValues).eq("id", userId);
            return Response.json(
                { error: "The profile was not changed because its Authentication user could not be loaded." },
                { status: 502 },
            );
        }

        const previousAuthUser = authResult.data.user;
        const authUpdate = await admin.auth.admin.updateUserById(authUserId, {
            ...(input.email !== undefined
                ? { email: input.email, email_confirm: true }
                : {}),
            ...(input.role !== undefined
                ? {
                    app_metadata: {
                        ...previousAuthUser.app_metadata,
                        nu_role: input.role,
                    },
                }
                : {}),
            ...((
                input.username !== undefined ||
                input.firstname !== undefined ||
                input.lastname !== undefined ||
                input.middlename !== undefined ||
                input.ext !== undefined ||
                input.phone !== undefined
            )
                ? {
                    user_metadata: {
                        ...previousAuthUser.user_metadata,
                        ...(input.username !== undefined ? { username: input.username } : {}),
                        ...(input.firstname !== undefined ? { firstname: input.firstname } : {}),
                        ...(input.lastname !== undefined ? { lastname: input.lastname } : {}),
                        ...(input.middlename !== undefined
                            ? { middlename: input.middlename, middle_name: input.middlename }
                            : {}),
                        ...(input.ext !== undefined ? { ext: input.ext } : {}),
                        ...(input.phone !== undefined
                            ? { phone: input.phone, phone_number: input.phone }
                            : {}),
                    },
                }
                : {}),
        });
        if (authUpdate.error) {
            await admin.from("nu_users").update(rollbackValues).eq("id", userId);
            return Response.json(
                {
                    error: authUpdate.error.message.toLowerCase().includes("already")
                        ? "Another Supabase Authentication user already uses that email address."
                        : "The profile was not changed because its Authentication account could not be updated.",
                },
                { status: authUpdate.error.message.toLowerCase().includes("already") ? 409 : 502 },
            );
        }
    }

    return Response.json({ user: parseUserRecord(updatedProfile.data) });
}

export async function DELETE(request: Request, context: UserRouteContext) {
    const manager = await requireUserManager(request);
    if (manager instanceof Response) return manager;

    const { id } = await context.params;
    const userId = Number(id);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return Response.json({ error: "Invalid user ID." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const currentProfile = await admin
        .from("nu_users")
        .select(USER_SELECT)
        .eq("id", userId)
        .maybeSingle();
    if (currentProfile.error) return databaseError(currentProfile.error, "Unable to load the user.");
    if (!currentProfile.data) return Response.json({ error: "User not found." }, { status: 404 });

    const profile = parseUserRecord(currentProfile.data);
    const profileEmail = normalizeEmail(profile.email);
    if (!profileEmail) {
        return Response.json(
            { error: "The user profile does not have a valid email address." },
            { status: 409 },
        );
    }

    if (
        profile.auth_user_id === manager.id ||
        normalizeEmail(manager.email) === profileEmail
    ) {
        return Response.json(
            { error: "You cannot delete the administrator account you are currently using." },
            { status: 409 },
        );
    }

    const authUserId = await findAuthenticationUserIdByEmail(
        profile.email,
        profile.auth_user_id,
    );
    if (authUserId instanceof Response) return authUserId;

    if (authUserId) {
        const authDeletion = await admin.auth.admin.deleteUser(authUserId);
        if (authDeletion.error) {
            return Response.json(
                { error: "The user was not deleted because their Supabase Authentication credentials could not be removed." },
                { status: 502 },
            );
        }
    }

    const relatedRecordCounts: Record<string, number> = {};
    const clearedReferenceCounts: Record<string, number> = {};
    const certificateRows = await admin
        .from("nu_certificates")
        .select("id, file_path")
        .eq("recipient_email", profile.email);
    if (certificateRows.error) {
        return Response.json(
            { error: "Authentication credentials were deleted, but certificate records could not be loaded. Retry the deletion to finish." },
            { status: 502 },
        );
    }
    const certificateIds = (certificateRows.data || []).map((row) => row.id as string);
    const certificatePaths = (certificateRows.data || [])
        .map((row) => row.file_path as string | null)
        .filter((path): path is string => Boolean(path));
    if (certificatePaths.length) {
        const storageDeletion = await admin.storage.from("QMOStorage").remove(certificatePaths);
        if (storageDeletion.error) {
            return Response.json(
                { error: "Authentication credentials were deleted, but stored certificate files could not be removed. Retry the deletion to finish." },
                { status: 502 },
            );
        }
    }
    if (certificateIds.length) {
        const auditDeletion = await admin
            .from("nu_certificate_audits")
            .delete({ count: "exact" })
            .in("certificate_id", certificateIds);
        if (auditDeletion.error) {
            return databaseError(auditDeletion.error, "Unable to remove certificate audit records.");
        }
        relatedRecordCounts.nu_certificate_audits = auditDeletion.count || 0;

        const certificateDeletion = await admin
            .from("nu_certificates")
            .delete({ count: "exact" })
            .in("id", certificateIds);
        if (certificateDeletion.error) {
            return databaseError(certificateDeletion.error, "Unable to remove certificate records.");
        }
        relatedRecordCounts.nu_certificates = certificateDeletion.count || 0;
    }
    const relatedTables = [
        "nu_event_attendees_log",
        "nu_event_attendees",
        "nu_event_question",
        "nu_user_note",
    ] as const;
    const relatedUserIds = [...new Set(
        [authUserId, profile.auth_user_id].filter((value): value is string => Boolean(value)),
    )];

    for (const table of relatedTables) {
        relatedRecordCounts[table] = 0;
        for (const relatedUserId of relatedUserIds) {
            const deletion = await admin
                .from(table)
                .delete({ count: "exact" })
                .eq("user_id", relatedUserId);
            if (deletion.error) {
                return Response.json(
                    {
                        error: authUserId
                            ? `Authentication credentials were deleted, but related records in ${table} could not be removed. Retry the deletion to finish.`
                            : `Related records in ${table} could not be removed.`,
                    },
                    { status: authUserId ? 502 : 500 },
                );
            }
            relatedRecordCounts[table] += deletion.count || 0;
        }
    }

    const numericReferences = [
        ["nu_users", "admin_confirmed_by"],
        ["nu_buildings", "created_by"],
        ["nu_buildings", "last_updated_by"],
        ["nu_departments", "created_by"],
        ["nu_departments", "last_updated_by"],
        ["nu_floors", "created_by"],
        ["nu_floors", "last_updated_by"],
        ["nu_rooms", "created_by"],
        ["nu_rooms", "last_updated_by"],
        ["nu_places", "created_by"],
        ["nu_places", "last_updated_by"],
        ["nu_events", "created_by"],
        ["nu_events", "event_head_organizer_id"],
        ["nu_events", "event_host_user_id"],
    ] as const;

    for (const [table, column] of numericReferences) {
        const update = await admin
            .from(table)
            .update({ [column]: null }, { count: "exact" })
            .eq(column, userId);
        if (update.error) {
            return Response.json(
                {
                    error: authUserId
                        ? `Authentication credentials were deleted, but references in ${table}.${column} could not be cleared. Retry the deletion to finish.`
                        : `References in ${table}.${column} could not be cleared.`,
                },
                { status: authUserId ? 502 : 500 },
            );
        }
        clearedReferenceCounts[`${table}.${column}`] = update.count || 0;
    }

    const profileDeletion = await admin
        .from("nu_users")
        .delete()
        .eq("id", userId)
        .select("id")
        .maybeSingle();
    if (profileDeletion.error) {
        return Response.json(
            {
                error: authUserId
                    ? "Authentication credentials were deleted, but the user profile could not be removed. Retry the deletion to finish."
                    : "Unable to delete the user profile.",
            },
            { status: authUserId ? 502 : 500 },
        );
    }

    return Response.json({
        deletedUser: { id: profile.id, email: profile.email },
        authUserDeleted: Boolean(authUserId),
        deletedRelatedRecords: relatedRecordCounts,
        clearedRelatedReferences: clearedReferenceCounts,
    });
}
