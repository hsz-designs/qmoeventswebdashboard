import { randomUUID } from "node:crypto";
import { databaseError, requireApiUser } from "@/app/api/api-helpers";
import {
    CERTIFICATE_RECORD_TYPE,
    certificateTemplateInputSchema,
    storedCertificateTemplateSchema,
} from "@/app/api/certificates/certificate-template-schema";
import { requireUserManager } from "@/app/api/users/user-api";
import type { CertificateTemplate } from "@/lib/certificates";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const TEMPLATE_BUCKET = "QMOStorage";
const TEMPLATE_FOLDER = "certificate-templates";
const MAX_TEMPLATE_BYTES = 20 * 1024 * 1024;

async function bucketExists() {
    const result = await getSupabaseAdmin().storage.getBucket(TEMPLATE_BUCKET);
    if (!result.error) return { exists: true, error: null };
    const missingBucket = result.error.status === 404
        || result.error.status === 400
        || /bucket.*not found|not found.*bucket/i.test(result.error.message);
    if (missingBucket) return { exists: false, error: null };
    return { exists: false, error: result.error };
}

async function ensureTemplateBucket() {
    const current = await bucketExists();
    if (current.error) return current.error;
    if (current.exists) return null;

    const created = await getSupabaseAdmin().storage.createBucket(TEMPLATE_BUCKET, {
        public: false,
        fileSizeLimit: MAX_TEMPLATE_BYTES,
        allowedMimeTypes: ["application/json", "image/png", "image/jpeg"],
    });
    return created.error?.status === 409 ? null : created.error;
}

export async function GET(request: Request) {
    const user = await requireApiUser(request);
    if (user instanceof Response) return user;

    const templatesResult = await getSupabaseAdmin()
        .from("nu_certificate_templates")
        .select("id, event_id, type, name, asset_path, config, is_active, created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(500);
    if (templatesResult.error) {
        return Response.json({ error: "Unable to load certificate templates." }, { status: 502 });
    }

    const templates = new Map<string, CertificateTemplate>();
    for (const row of templatesResult.data || []) {
        const parsed = storedCertificateTemplateSchema.safeParse(row.config);
        if (parsed.success && !templates.has(parsed.data.id)) {
            templates.set(parsed.data.id, parsed.data as CertificateTemplate);
        }
    }

    return Response.json({ templates: [...templates.values()] });
}

export async function POST(request: Request) {
    const manager = await requireUserManager(request);
    if (manager instanceof Response) return manager;

    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        return Response.json({ error: "The request body must be valid JSON." }, { status: 400 });
    }

    const result = certificateTemplateInputSchema.safeParse(payload);
    if (!result.success) {
        return Response.json(
            { error: result.error.issues[0]?.message || "Check the certificate template." },
            { status: 422 },
        );
    }

    const bucketError = await ensureTemplateBucket();
    if (bucketError) {
        return Response.json({ error: "Unable to prepare certificate template storage." }, { status: 502 });
    }

    const now = new Date().toISOString();
    const template: CertificateTemplate = {
        ...result.data,
        id: randomUUID(),
        created_at: now,
        updated_at: now,
    };
    const assetPath = `${TEMPLATE_FOLDER}/${template.id}.json`;
    const admin = getSupabaseAdmin();
    const upload = await admin.storage
        .from(TEMPLATE_BUCKET)
        .upload(assetPath, JSON.stringify(template), {
            contentType: "application/json",
            cacheControl: "0",
            upsert: false,
        });
    if (upload.error) {
        return Response.json({ error: "Unable to save the certificate template." }, { status: 502 });
    }

    const templateRecord = await admin
        .from("nu_certificate_templates")
        .insert({
            id: template.id,
            event_id: null,
            type: CERTIFICATE_RECORD_TYPE,
            name: template.name,
            asset_path: assetPath,
            config: template,
            is_active: true,
            created_at: now,
        })
        .select("id")
        .single();
    if (templateRecord.error) {
        await admin.storage.from(TEMPLATE_BUCKET).remove([assetPath]);
        return databaseError(templateRecord.error, "Unable to save the certificate template details.");
    }

    return Response.json({ template }, { status: 201 });
}
