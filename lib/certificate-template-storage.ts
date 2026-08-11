import type { CertificateTemplate } from "@/lib/certificates";

const STORAGE_KEY = "nu-qmo-certificate-templates-v1";

function isTemplate(value: unknown): value is CertificateTemplate {
    if (!value || typeof value !== "object") return false;
    const template = value as Partial<CertificateTemplate>;
    return typeof template.id === "string"
        && typeof template.name === "string"
        && Array.isArray(template.elements);
}

function normalizeTemplate(template: CertificateTemplate): CertificateTemplate {
    return {
        ...template,
        backgroundImage: template.backgroundImage || null,
        backgroundImageFit: template.backgroundImageFit || "cover",
        backgroundImageOpacity: template.backgroundImageOpacity ?? 1,
        showFoundation: template.showFoundation ?? true,
        foundationOpacity: template.foundationOpacity ?? 1,
    };
}

export function readBrowserCertificateTemplates() {
    if (typeof window === "undefined") return [];

    try {
        const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
        return Array.isArray(parsed)
            ? parsed.filter(isTemplate).map(normalizeTemplate)
            : [];
    } catch {
        return [];
    }
}

export function saveBrowserCertificateTemplate(template: CertificateTemplate) {
    if (typeof window === "undefined") return;

    const templates = readBrowserCertificateTemplates();
    const normalized = normalizeTemplate(template);
    const next = [
        normalized,
        ...templates.filter((item) => item.id !== template.id),
    ].slice(0, 100);
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Prefer retaining the newly saved template if older cached templates
        // plus uploaded images exceed the browser's storage quota.
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([normalized]));
    }
}

export function mergeCertificateTemplates(...collections: CertificateTemplate[][]) {
    const templates = new Map<string, CertificateTemplate>();
    collections.flat().forEach((template) => {
        if (!templates.has(template.id)) templates.set(template.id, normalizeTemplate(template));
    });
    return [...templates.values()];
}
