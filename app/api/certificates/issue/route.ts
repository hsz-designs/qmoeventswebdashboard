import { randomBytes, randomUUID } from "node:crypto";
import { databaseError } from "@/app/api/api-helpers";
import {
    CERTIFICATE_RECORD_TYPE,
    storedCertificateTemplateSchema,
} from "@/app/api/certificates/certificate-template-schema";
import { EVENT_SELECT, parseEventRecord } from "@/app/api/events/event-api";
import { parseUserRecord, requireUserManager, USER_SELECT } from "@/app/api/users/user-api";
import {
    safeCertificateFilename,
    type CertificateRecord,
    type CertificateTemplate,
} from "@/lib/certificates";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { userDisplayName } from "@/lib/users";

export const runtime = "nodejs";

const STORAGE_BUCKET = "QMOStorage";
const CERTIFICATE_FOLDER = "certificates";
const TEMPLATE_FOLDER = "certificate-templates";
const MAX_CERTIFICATE_BYTES = 20 * 1024 * 1024;
const ATTENDEE_CERTIFICATE_URL_TTL_SECONDS = 60 * 60 * 24 * 365 * 10;
const CERTIFICATE_SELECT = [
    "id",
    "event_id",
    "type",
    "status",
    "recipient_name",
    "recipient_email",
    "verification_code",
    "issued_at",
    "revoked_at",
    "file_path",
    "created_at",
].join(", ");

function positiveInteger(value: FormDataEntryValue | null) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function ensureStorageBucket() {
    const admin = getSupabaseAdmin();
    const existing = await admin.storage.getBucket(STORAGE_BUCKET);
    if (!existing.error) {
        if (existing.data?.public === false) {
            const updated = await admin.storage.updateBucket(STORAGE_BUCKET, {
                public: true,
                fileSizeLimit: MAX_CERTIFICATE_BYTES,
                allowedMimeTypes: ["image/png", "image/jpeg", "application/json"],
            });
            return updated.error?.status === 409 ? null : updated.error;
        }

        return null;
    }

    const missing = existing.error.status === 404
        || existing.error.status === 400
        || /bucket.*not found|not found.*bucket/i.test(existing.error.message);
    if (!missing) return existing.error;

    const created = await admin.storage.createBucket(STORAGE_BUCKET, {
        public: true,
        fileSizeLimit: MAX_CERTIFICATE_BYTES,
        allowedMimeTypes: ["image/png", "image/jpeg", "application/json"],
    });
    return created.error?.status === 409 ? null : created.error;
}

async function ensureEventTemplate(eventId: number, template: CertificateTemplate) {
    const admin = getSupabaseAdmin();
    const existing = await admin
        .from("nu_certificate_templates")
        .select("id, asset_path")
        .eq("event_id", eventId)
        .eq("type", CERTIFICATE_RECORD_TYPE)
        .eq("name", template.name)
        .eq("is_active", true)
        .contains("config", { id: template.id })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (existing.error || existing.data) return existing;

    const recordId = randomUUID();
    const assetPath = `${TEMPLATE_FOLDER}/${safeCertificateFilename(template.name)}-${eventId}-${recordId}.json`;
    const upload = await admin.storage
        .from(STORAGE_BUCKET)
        .upload(assetPath, JSON.stringify(template), {
            contentType: "application/json",
            cacheControl: "3600",
            upsert: false,
        });
    if (upload.error) return { data: null, error: upload.error };

    const inserted = await admin
        .from("nu_certificate_templates")
        .insert({
            id: recordId,
            event_id: eventId,
            type: CERTIFICATE_RECORD_TYPE,
            name: template.name,
            asset_path: assetPath,
            config: template,
            is_active: true,
        })
        .select("id, asset_path")
        .single();
    if (inserted.error) {
        await admin.storage.from(STORAGE_BUCKET).remove([assetPath]);
    }
    return inserted;
}

async function storageCertificateUrl(filePath: string | null) {
    if (!filePath) return null;

    const bucket = getSupabaseAdmin().storage.from(STORAGE_BUCKET);
    const publicUrlResult = await bucket.getPublicUrl(filePath);
    if (!publicUrlResult.data?.publicUrl) {
        const signed = await bucket.createSignedUrl(filePath, ATTENDEE_CERTIFICATE_URL_TTL_SECONDS);
        return signed.error ? null : signed.data.signedUrl;
    }

    return publicUrlResult.data.publicUrl;
}

async function linkCertificateToAttendance({
    certificateUrl,
    eventId,
    sessionId,
    userId,
}: {
    certificateUrl: string;
    eventId: number;
    sessionId: number | null;
    userId: string;
}) {
    let update = getSupabaseAdmin()
        .from("nu_event_attendees")
        .update({ certificate_url: certificateUrl })
        .eq("event_id", eventId)
        .eq("user_id", userId);
    if (sessionId) update = update.eq("session_id", sessionId);
    return update.select("id");
}

export async function POST(request: Request) {
    const manager = await requireUserManager(request);
    if (manager instanceof Response) return manager;

    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return Response.json({ error: "The certificate upload must use multipart form data." }, { status: 400 });
    }

    const userId = positiveInteger(formData.get("userId"));
    const eventId = positiveInteger(formData.get("eventId"));
    const sessionValue = formData.get("sessionId");
    const sessionId = sessionValue ? positiveInteger(sessionValue) : null;
    const certificateFile = formData.get("certificate");
    if (!userId || !eventId || (sessionValue && !sessionId)) {
        return Response.json({ error: "Choose a valid user, event, and session." }, { status: 400 });
    }
    if (!certificateFile || typeof certificateFile === "string") {
        return Response.json({ error: "Attach the generated certificate image." }, { status: 400 });
    }
    const contentType = certificateFile.type === "image/jpg" ? "image/jpeg" : certificateFile.type;
    if (!["image/png", "image/jpeg"].includes(contentType) || certificateFile.size <= 0) {
        return Response.json({ error: "The generated certificate must be a PNG or JPG image." }, { status: 422 });
    }
    if (certificateFile.size > MAX_CERTIFICATE_BYTES) {
        return Response.json({ error: "The generated certificate exceeds the 20 MB upload limit." }, { status: 413 });
    }

    let templatePayload: unknown;
    try {
        templatePayload = JSON.parse(String(formData.get("template") || ""));
    } catch {
        return Response.json({ error: "The selected certificate template is invalid." }, { status: 400 });
    }
    const parsedTemplate = storedCertificateTemplateSchema.safeParse(templatePayload);
    if (!parsedTemplate.success) {
        return Response.json(
            { error: parsedTemplate.error.issues[0]?.message || "The selected certificate template is invalid." },
            { status: 422 },
        );
    }
    const template = parsedTemplate.data as CertificateTemplate;

    const fileBytes = Buffer.from(await certificateFile.arrayBuffer());
    const isPng = contentType === "image/png"
        && fileBytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
    const isJpeg = contentType === "image/jpeg"
        && fileBytes.subarray(0, 3).toString("hex") === "ffd8ff";
    if (!isPng && !isJpeg) {
        return Response.json({ error: "The uploaded file is not a valid PNG or JPG certificate." }, { status: 422 });
    }
    const fileExtension = isJpeg ? "jpg" : "png";

    const admin = getSupabaseAdmin();
    const [userResult, eventResult] = await Promise.all([
        admin.from("nu_users").select(USER_SELECT).eq("id", userId).maybeSingle(),
        admin.from("nu_events").select(EVENT_SELECT).eq("id", eventId).maybeSingle(),
    ]);
    const lookupError = userResult.error || eventResult.error;
    if (lookupError) return databaseError(lookupError, "Unable to load the certificate recipient or event.");
    if (!userResult.data || !eventResult.data) {
        return Response.json({ error: "The certificate recipient or event was not found." }, { status: 404 });
    }

    const user = parseUserRecord(userResult.data);
    const event = parseEventRecord(eventResult.data);
    if (!user.auth_user_id) {
        return Response.json({ error: "This user has no linked Authentication user ID." }, { status: 409 });
    }

    let registrationQuery = admin
        .from("nu_event_attendees")
        .select("id")
        .eq("event_id", eventId)
        .eq("user_id", user.auth_user_id);
    if (sessionId) registrationQuery = registrationQuery.eq("session_id", sessionId);
    const registration = await registrationQuery.limit(1).maybeSingle();
    if (registration.error) return databaseError(registration.error, "Unable to verify event registration.");
    if (!registration.data) {
        return Response.json(
            { error: sessionId ? "This user is not registered for the selected session." : "This user is not registered for the selected event." },
            { status: 409 },
        );
    }

    const bucketError = await ensureStorageBucket();
    if (bucketError) {
        return Response.json({ error: "Unable to prepare certificate storage." }, { status: 502 });
    }

    const templateRecord = await ensureEventTemplate(eventId, template);
    if (templateRecord.error || !templateRecord.data) {
        return Response.json({ error: "Unable to save the selected certificate template details." }, { status: 502 });
    }

    const existing = await admin
        .from("nu_certificates")
        .select(CERTIFICATE_SELECT)
        .eq("event_id", eventId)
        .eq("recipient_email", user.email)
        .is("revoked_at", null)
        .not("file_path", "is", null)
        .like("file_path", `%.${fileExtension}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (existing.error) return databaseError(existing.error, "Unable to check existing certificates.");
    const existingCertificate = existing.data as unknown as CertificateRecord | null;

    if (existingCertificate) {
        const downloadUrl = await storageCertificateUrl(existingCertificate.file_path);
        if (downloadUrl) {
            const attendanceResult = await linkCertificateToAttendance({
                certificateUrl: downloadUrl,
                eventId,
                sessionId,
                userId: user.auth_user_id,
            });
            if (attendanceResult.error) {
                return databaseError(
                    attendanceResult.error,
                    "Unable to link the certificate URL to the attendee record.",
                );
            }
            if (!attendanceResult.data.length) {
                return Response.json(
                    { error: "The attendee registration changed before the certificate URL could be saved." },
                    { status: 409 },
                );
            }

            await admin.from("nu_certificate_audits").insert({
                certificate_id: existingCertificate.id,
                action: "verify",
                actor_user_id: manager.id,
                metadata: {
                    outcome: "existing_file_reused",
                    event_id: eventId,
                    session_id: sessionId,
                    template_id: templateRecord.data.id,
                    template_name: template.name,
                    file_path: existingCertificate.file_path,
                    file_format: fileExtension,
                },
            });
            return Response.json({
                certificate: existingCertificate,
                alreadyIssued: true,
                downloadUrl,
                storageBucket: STORAGE_BUCKET,
                templateRecordId: templateRecord.data.id,
                attendanceRecordsUpdated: attendanceResult.data.length,
            });
        }

        await admin
            .from("nu_certificates")
            .update({ status: "file_missing", revoked_at: new Date().toISOString() })
            .eq("id", existingCertificate.id);
    }

    const issuedAt = new Date().toISOString();
    const verificationCode = `NUQMO${randomBytes(8).toString("hex").toUpperCase()}`;
    const recipientName = userDisplayName(user);
    const filename = `${safeCertificateFilename(recipientName)}-${safeCertificateFilename(event.event_name)}-${verificationCode.toLowerCase()}.${fileExtension}`;
    const filePath = `${CERTIFICATE_FOLDER}/${filename}`;
    const upload = await admin.storage.from(STORAGE_BUCKET).upload(filePath, fileBytes, {
        contentType,
        cacheControl: "3600",
        upsert: false,
    });
    if (upload.error) {
        return Response.json({ error: "Unable to upload the generated certificate to Supabase Storage." }, { status: 502 });
    }

    const downloadUrl = await storageCertificateUrl(filePath);
    if (!downloadUrl) {
        await admin.storage.from(STORAGE_BUCKET).remove([filePath]);
        return Response.json({ error: "Unable to create the certificate URL." }, { status: 502 });
    }

    const certificateResult = await admin
        .from("nu_certificates")
        .insert({
            event_id: eventId,
            type: CERTIFICATE_RECORD_TYPE,
            status: "issued",
            recipient_name: recipientName,
            recipient_email: user.email,
            verification_code: verificationCode,
            issued_at: issuedAt,
            revoked_at: null,
            file_path: filePath,
        })
        .select(CERTIFICATE_SELECT)
        .single();
    if (certificateResult.error) {
        await admin.storage.from(STORAGE_BUCKET).remove([filePath]);
        return databaseError(certificateResult.error, "Unable to save the certificate issuance record.");
    }
    const issuedCertificate = certificateResult.data as unknown as CertificateRecord;

    const auditResult = await admin.from("nu_certificate_audits").insert({
        certificate_id: issuedCertificate.id,
        action: "issue",
        actor_user_id: manager.id,
        metadata: {
            event_id: eventId,
            event_name: event.event_name,
            session_id: sessionId,
            user_id: user.id,
            auth_user_id: user.auth_user_id,
            template_id: templateRecord.data.id,
            template_name: template.name,
            storage_bucket: STORAGE_BUCKET,
            file_path: filePath,
            file_format: fileExtension,
        },
    });
    if (auditResult.error) {
        await admin.from("nu_certificates").delete().eq("id", issuedCertificate.id);
        await admin.storage.from(STORAGE_BUCKET).remove([filePath]);
        return databaseError(auditResult.error, "Unable to save the certificate audit trail.");
    }

    const attendanceResult = await linkCertificateToAttendance({
        certificateUrl: downloadUrl,
        eventId,
        sessionId,
        userId: user.auth_user_id,
    });
    if (attendanceResult.error) {
        await admin.from("nu_certificate_audits").insert({
            certificate_id: issuedCertificate.id,
            action: "verify",
            actor_user_id: manager.id,
            metadata: {
                outcome: "attendance_link_failed",
                event_id: eventId,
                session_id: sessionId,
                user_id: user.id,
                file_path: filePath,
            },
        });
        return databaseError(
            attendanceResult.error,
            "The certificate was issued, but its URL could not be linked to the attendee record. Retry to finish linking it.",
        );
    }
    if (!attendanceResult.data.length) {
        return Response.json(
            { error: "The certificate was issued, but the attendee registration changed before its URL could be saved. Retry to finish linking it." },
            { status: 409 },
        );
    }

    return Response.json({
        certificate: issuedCertificate,
        alreadyIssued: false,
        downloadUrl,
        storageBucket: STORAGE_BUCKET,
        templateRecordId: templateRecord.data.id,
        attendanceRecordsUpdated: attendanceResult.data.length,
    }, { status: 201 });
}
