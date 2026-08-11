import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

type SupabaseDatabaseError = {
    code?: string;
    message: string;
};

type InsertResult = {
    data: unknown;
    error: SupabaseDatabaseError | null;
};

let adminClient: SupabaseClient | undefined;

function readBackendEnvironment(variableName: string) {
    try {
        const contents = readFileSync(join(process.cwd(), "backend", ".env"), "utf8");
        const prefix = `${variableName}=`;
        const line = contents
            .split(/\r?\n/)
            .find((candidate) => candidate.trimStart().startsWith(prefix));

        if (!line) return undefined;

        const value = line.trimStart().slice(prefix.length).trim();
        const hasMatchingQuotes =
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"));

        return hasMatchingQuotes ? value.slice(1, -1) : value;
    } catch {
        return undefined;
    }
}

function requiredEnvironment(variableName: "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY") {
    const value = process.env[variableName] || readBackendEnvironment(variableName);

    if (!value) {
        throw new Error(
            `${variableName} is not configured. Set it in the server environment or backend/.env.`,
        );
    }

    return value;
}

export function getSupabaseAdmin() {
    if (!adminClient) {
        adminClient = createClient(
            requiredEnvironment("SUPABASE_URL"),
            requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
            {
                auth: {
                    autoRefreshToken: false,
                    detectSessionInUrl: false,
                    persistSession: false,
                },
            },
        );
    }

    return adminClient;
}

export async function authenticateSupabaseRequest(request: Request): Promise<User | null> {
    const authorization = request.headers.get("authorization");
    const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

    if (!accessToken) return null;

    const { data, error } = await getSupabaseAdmin().auth.getUser(accessToken);
    return error ? null : data.user;
}

function isPrimaryKeySequenceCollision(error: SupabaseDatabaseError | null, table: string) {
    return Boolean(
        error?.code === "23505" &&
        (error.message.includes(`${table}_pkey`) || error.message.includes("duplicate key value")),
    );
}

export async function insertWithIdentityRecovery(
    table: string,
    values: Record<string, unknown>,
    select: string,
): Promise<InsertResult> {
    const admin = getSupabaseAdmin();

    async function insert(payload: Record<string, unknown>): Promise<InsertResult> {
        return admin.from(table).insert(payload).select(select).single();
    }

    let result = await insert(values);
    if (!isPrimaryKeySequenceCollision(result.error, table)) return result;

    // CSV imports supplied explicit primary keys, which can leave the identity
    // sequence behind MAX(id). Retry with a fresh ID while reset_sequences.sql
    // remains the permanent database-level repair.
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const highestId = await admin
            .from(table)
            .select("id")
            .order("id", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (highestId.error) return { data: null, error: highestId.error };

        const nextId = Number(highestId.data?.id || 0) + 1;
        result = await insert({ ...values, id: nextId });
        if (!isPrimaryKeySequenceCollision(result.error, table)) return result;
    }

    return result;
}
