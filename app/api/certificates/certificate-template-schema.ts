import { z } from "zod";

// The live Supabase tables constrain certificate/template types to semantic
// certificate categories. The visual composition remains in config.design.
export const CERTIFICATE_RECORD_TYPE = "attendance";

const uploadedImageSchema = z.union([
    z.string()
        .max(4_000_000)
        .regex(/^data:image\/(png|jpeg|webp);base64,/i, "Use a PNG, JPEG, or WebP image."),
    z.string().regex(/^\/certificate-assets\/[a-z0-9-]+\.svg$/),
]);

const elementBaseSchema = z.object({
    id: z.string().trim().min(1).max(100),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    width: z.number().min(1).max(100),
    height: z.number().min(1).max(100),
    zIndex: z.number().int().min(0).max(1000),
});

const textElementSchema = elementBaseSchema.extend({
    type: z.literal("text"),
    content: z.string().max(2000),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    fontFamily: z.enum(["sans", "serif"]),
    fontSize: z.number().min(8).max(160),
    fontWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)]),
    align: z.enum(["left", "center", "right"]),
    lineHeight: z.number().min(0.8).max(2.5),
    italic: z.boolean(),
});

const imageElementSchema = elementBaseSchema.extend({
    type: z.literal("image"),
    src: uploadedImageSchema,
    alt: z.string().trim().max(200),
    objectFit: z.enum(["contain", "cover"]),
    opacity: z.number().min(0.05).max(1),
});

export const certificateTemplateInputSchema = z.object({
    name: z.string().trim().min(2, "Enter a template name.").max(120),
    design: z.enum(["signature", "horizon", "laurel"]).default("signature"),
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    backgroundImage: uploadedImageSchema.nullable().default(null),
    backgroundImageFit: z.enum(["cover", "contain"]).default("cover"),
    backgroundImageOpacity: z.number().min(0.05).max(1).default(1),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    showFoundation: z.boolean().default(true),
    foundationOpacity: z.number().min(0.05).max(1).default(1),
    elements: z.array(z.discriminatedUnion("type", [textElementSchema, imageElementSchema])).min(1).max(40),
}).superRefine((value, context) => {
    const imageBytes = (value.backgroundImage?.length || 0) + value.elements.reduce(
        (total, element) => total + (element.type === "image" ? element.src.length : 0),
        0,
    );
    if (imageBytes > 10_000_000) {
        context.addIssue({
            code: "custom",
            path: ["elements"],
            message: "Template images are too large. Keep the combined image size below 10 MB.",
        });
    }
});

export const storedCertificateTemplateSchema = certificateTemplateInputSchema.and(z.object({
    id: z.string().trim().min(1).max(100),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
}));
