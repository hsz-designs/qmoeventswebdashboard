export const CERTIFICATE_DESIGN_WIDTH = 1400;
export const CERTIFICATE_DESIGN_HEIGHT = 990;
export const CERTIFICATE_OUTPUT_WIDTH = 3508;
export const CERTIFICATE_OUTPUT_HEIGHT = 2480;

export type CertificateBindingData = {
    recipientName: string;
    eventName: string;
    eventDate: string;
    issuer: string;
};

type CertificateElementBase = {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    zIndex: number;
};

export type CertificateTextElement = CertificateElementBase & {
    type: "text";
    content: string;
    color: string;
    fontFamily: "sans" | "serif";
    fontSize: number;
    fontWeight: 400 | 500 | 600 | 700;
    align: "left" | "center" | "right";
    lineHeight: number;
    italic: boolean;
};

export type CertificateImageElement = CertificateElementBase & {
    type: "image";
    src: string;
    alt: string;
    objectFit: "contain" | "cover";
    opacity: number;
};

export type CertificateElement = CertificateTextElement | CertificateImageElement;

export type CertificateDesign = "signature" | "horizon" | "laurel";

export type CertificateTemplate = {
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
    design: CertificateDesign;
    backgroundColor: string;
    backgroundImage: string | null;
    backgroundImageFit: "cover" | "contain";
    backgroundImageOpacity: number;
    primaryColor: string;
    accentColor: string;
    showFoundation: boolean;
    foundationOpacity: number;
    elements: CertificateElement[];
};

export type CertificateTemplatesResponse = {
    templates: CertificateTemplate[];
};

export type CertificateRecord = {
    id: string;
    event_id: number;
    type: string;
    status: string;
    recipient_name: string;
    recipient_email: string;
    verification_code: string;
    issued_at: string | null;
    revoked_at: string | null;
    file_path: string | null;
    created_at: string;
};

export type CertificateIssueResponse = {
    certificate: CertificateRecord;
    alreadyIssued: boolean;
    downloadUrl: string | null;
    storageBucket: string;
    templateRecordId: string;
    attendanceRecordsUpdated: number;
};

export const SAMPLE_CERTIFICATE_DATA: CertificateBindingData = {
    recipientName: "Juan Dela Cruz",
    eventName: "Quality Excellence Forum 2026",
    eventDate: "August 8, 2026",
    issuer: "National University QMO Manila",
};

export function resolveCertificateText(
    content: string,
    data: CertificateBindingData,
) {
    return content.replace(
        /\{\{\s*(recipientName|eventName|eventDate|issuer)\s*\}\}/g,
        (_match, key: keyof CertificateBindingData) => data[key],
    );
}

function textElement(
    id: string,
    content: string,
    x: number,
    y: number,
    width: number,
    height: number,
    overrides: Partial<Omit<CertificateTextElement, "id" | "type" | "content" | "x" | "y" | "width" | "height">> = {},
): CertificateTextElement {
    return {
        id,
        type: "text",
        content,
        x,
        y,
        width,
        height,
        zIndex: 2,
        color: "#123a70",
        fontFamily: "sans",
        fontSize: 18,
        fontWeight: 500,
        align: "center",
        lineHeight: 1.2,
        italic: false,
        ...overrides,
    };
}

function imageElement(
    id: string,
    src: string,
    alt: string,
    x: number,
    y: number,
    width: number,
    height: number,
): CertificateImageElement {
    return {
        id,
        type: "image",
        src,
        alt,
        x,
        y,
        width,
        height,
        zIndex: 3,
        objectFit: "contain",
        opacity: 1,
    };
}

export function createDefaultCertificateTemplates(): CertificateTemplate[] {
    const now = new Date().toISOString();

    return [
        {
            id: "nu-qmo-signature",
            name: "NU QMO Signature",
            created_at: now,
            updated_at: now,
            design: "signature",
            backgroundColor: "#fffdf8",
            backgroundImage: null,
            backgroundImageFit: "cover",
            backgroundImageOpacity: 1,
            primaryColor: "#123a70",
            accentColor: "#c99a32",
            showFoundation: true,
            foundationOpacity: 1,
            elements: [
                imageElement("signature-logo", "/certificate-assets/nu-qmo-seal.svg", "NU QMO seal", 6.1, 5.4, 7, 9.9),
                textElement("signature-institution", "NATIONAL UNIVERSITY", 16, 7.7, 68, 4, { fontSize: 28, fontWeight: 700, lineHeight: 1 }),
                textElement("signature-office", "QUALITY MANAGEMENT OFFICE · MANILA", 16, 12.2, 68, 3, { color: "#64748b", fontSize: 13, fontWeight: 600, lineHeight: 1 }),
                textElement("signature-title", "CERTIFICATE OF PARTICIPATION", 12, 23, 76, 7, { fontFamily: "serif", fontSize: 52, fontWeight: 700, lineHeight: 1 }),
                textElement("signature-presentation", "PROUDLY PRESENTED TO", 18, 34, 64, 3, { color: "#64748b", fontSize: 14, fontWeight: 600, lineHeight: 1 }),
                textElement("signature-recipient", "{{recipientName}}", 10, 40, 80, 10, { color: "#102f59", fontFamily: "serif", fontSize: 64, fontWeight: 700, lineHeight: 1.05, italic: true }),
                textElement("signature-copy", "for active participation and meaningful contribution to", 21, 53, 58, 7, { color: "#475569", fontSize: 18, fontWeight: 400, lineHeight: 1.35 }),
                textElement("signature-event", "{{eventName}}", 15, 61, 70, 9, { fontSize: 34, fontWeight: 700, lineHeight: 1.15 }),
                textElement("signature-date", "Presented on {{eventDate}}", 20, 72, 60, 3, { color: "#64748b", fontSize: 16, lineHeight: 1 }),
                textElement("signature-signatory", "AUTHORIZED SIGNATORY", 35, 84, 30, 3, { fontSize: 15, fontWeight: 700, lineHeight: 1 }),
                textElement("signature-issuer", "{{issuer}}", 30, 88, 40, 3, { color: "#64748b", fontSize: 13, lineHeight: 1 }),
            ],
        },
        {
            id: "nu-qmo-horizon",
            name: "NU QMO Modern Horizon",
            created_at: now,
            updated_at: now,
            design: "horizon",
            backgroundColor: "#fbfdff",
            backgroundImage: null,
            backgroundImageFit: "cover",
            backgroundImageOpacity: 1,
            primaryColor: "#0d3b72",
            accentColor: "#d2a84c",
            showFoundation: true,
            foundationOpacity: 1,
            elements: [
                imageElement("horizon-logo", "/certificate-assets/nu-qmo-monogram.svg", "NU QMO modern monogram", 73, 6, 18, 10),
                textElement("horizon-office", "NATIONAL UNIVERSITY · QMO MANILA", 14, 8, 52, 4, { fontSize: 14, fontWeight: 700, align: "left", lineHeight: 1 }),
                textElement("horizon-kicker", "RECOGNITION OF EXCELLENCE", 14, 14, 52, 3, { color: "#b58424", fontSize: 13, fontWeight: 700, align: "left", lineHeight: 1 }),
                textElement("horizon-title", "CERTIFICATE\nOF PARTICIPATION", 14, 20, 69, 13, { fontSize: 48, fontWeight: 700, align: "left", lineHeight: 1.02 }),
                textElement("horizon-presentation", "THIS DISTINCTION IS PRESENTED TO", 14, 37, 60, 3, { color: "#64748b", fontSize: 13, fontWeight: 600, align: "left", lineHeight: 1 }),
                textElement("horizon-recipient", "{{recipientName}}", 14, 42, 72, 10, { color: "#102f59", fontFamily: "serif", fontSize: 60, fontWeight: 700, align: "left", lineHeight: 1, italic: true }),
                textElement("horizon-copy", "in recognition of valuable participation and contribution to", 14, 55, 57, 6, { color: "#475569", fontSize: 17, fontWeight: 400, align: "left", lineHeight: 1.35 }),
                textElement("horizon-event", "{{eventName}}", 14, 63, 70, 9, { fontSize: 32, fontWeight: 700, align: "left", lineHeight: 1.12 }),
                textElement("horizon-date", "{{eventDate}}", 14, 75, 42, 3, { color: "#b58424", fontSize: 16, fontWeight: 600, align: "left", lineHeight: 1 }),
                textElement("horizon-signatory", "AUTHORIZED SIGNATORY", 61, 84, 27, 3, { fontSize: 14, fontWeight: 700, lineHeight: 1 }),
                textElement("horizon-issuer", "{{issuer}}", 58, 88, 33, 3, { color: "#64748b", fontSize: 12, lineHeight: 1 }),
            ],
        },
        {
            id: "nu-qmo-laurel",
            name: "NU QMO Heritage Laurel",
            created_at: now,
            updated_at: now,
            design: "laurel",
            backgroundColor: "#fffef9",
            backgroundImage: null,
            backgroundImageFit: "cover",
            backgroundImageOpacity: 1,
            primaryColor: "#173f73",
            accentColor: "#c79532",
            showFoundation: true,
            foundationOpacity: 1,
            elements: [
                imageElement("laurel-logo", "/certificate-assets/nu-qmo-laurel.svg", "NU QMO laurel mark", 44, 4, 12, 13),
                textElement("laurel-institution", "NATIONAL UNIVERSITY", 20, 17, 60, 3, { fontFamily: "serif", fontSize: 20, fontWeight: 700, lineHeight: 1 }),
                textElement("laurel-office", "QUALITY MANAGEMENT OFFICE · MANILA", 20, 20.5, 60, 3, { color: "#b58424", fontSize: 12, fontWeight: 700, lineHeight: 1 }),
                textElement("laurel-title", "Certificate of Participation", 12, 27, 76, 8, { fontFamily: "serif", fontSize: 52, fontWeight: 700, lineHeight: 1, italic: true }),
                textElement("laurel-presentation", "WITH DISTINCTION, THIS IS PRESENTED TO", 20, 38, 60, 3, { color: "#64748b", fontSize: 13, fontWeight: 600, lineHeight: 1 }),
                textElement("laurel-recipient", "{{recipientName}}", 11, 43, 78, 9, { color: "#102f59", fontFamily: "serif", fontSize: 61, fontWeight: 700, lineHeight: 1.02 }),
                textElement("laurel-copy", "whose participation reflects a shared commitment to quality, excellence, and continuous improvement in", 22, 55, 56, 7, { color: "#475569", fontFamily: "serif", fontSize: 16, fontWeight: 400, lineHeight: 1.3, italic: true }),
                textElement("laurel-event", "{{eventName}}", 16, 64, 68, 8, { fontSize: 31, fontWeight: 700, lineHeight: 1.1 }),
                textElement("laurel-date", "Awarded this {{eventDate}}", 20, 74, 60, 3, { color: "#b58424", fontSize: 15, fontWeight: 600, lineHeight: 1 }),
                textElement("laurel-signatory", "AUTHORIZED SIGNATORY", 35, 84, 30, 3, { fontFamily: "serif", fontSize: 14, fontWeight: 700, lineHeight: 1 }),
                textElement("laurel-issuer", "{{issuer}}", 30, 88, 40, 3, { color: "#64748b", fontSize: 12, lineHeight: 1 }),
            ],
        },
    ];
}

export function createDefaultCertificateTemplate() {
    return createDefaultCertificateTemplates()[0];
}

export function createBlankCertificateTemplate(): CertificateTemplate {
    const now = new Date().toISOString();

    return {
        id: "blank-certificate-draft",
        name: "New certificate template",
        created_at: now,
        updated_at: now,
        design: "signature",
        backgroundColor: "#fffdf8",
        backgroundImage: null,
        backgroundImageFit: "cover",
        backgroundImageOpacity: 1,
        primaryColor: "#123a70",
        accentColor: "#c99a32",
        showFoundation: true,
        foundationOpacity: 1,
        elements: [
            textElement("blank-issuer", "NATIONAL UNIVERSITY QMO MANILA", 15, 10, 70, 4, { fontSize: 22, fontWeight: 700 }),
            textElement("blank-title", "CERTIFICATE OF PARTICIPATION", 12, 25, 76, 8, { fontFamily: "serif", fontSize: 52, fontWeight: 700 }),
            textElement("blank-presentation", "PROUDLY PRESENTED TO", 20, 37, 60, 3, { color: "#64748b", fontSize: 14, fontWeight: 600 }),
            textElement("blank-recipient", "{{recipientName}}", 10, 43, 80, 10, { fontFamily: "serif", fontSize: 64, fontWeight: 700, italic: true }),
            textElement("blank-event", "for participation in {{eventName}}", 17, 59, 66, 9, { fontSize: 28, fontWeight: 600 }),
            textElement("blank-date", "{{eventDate}}", 25, 72, 50, 4, { color: "#64748b", fontSize: 16 }),
            textElement("blank-office", "{{issuer}}", 30, 87, 40, 3, { color: "#64748b", fontSize: 13 }),
        ],
    };
}

export function safeCertificateFilename(value: string) {
    const cleaned = value
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
    return cleaned.slice(0, 90) || "certificate";
}
