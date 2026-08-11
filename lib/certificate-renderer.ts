"use client";

import {
    CERTIFICATE_DESIGN_WIDTH,
    CERTIFICATE_OUTPUT_HEIGHT,
    CERTIFICATE_OUTPUT_WIDTH,
    type CertificateBindingData,
    type CertificateImageElement,
    type CertificateTemplate,
    type CertificateTextElement,
    resolveCertificateText,
} from "@/lib/certificates";

function drawCertificateFoundation(
    context: CanvasRenderingContext2D,
    template: CertificateTemplate,
) {
    const width = context.canvas.width;
    const height = context.canvas.height;
    const scale = width / CERTIFICATE_DESIGN_WIDTH;

    if (template.design === "horizon") {
        const wash = context.createLinearGradient(0, 0, width, height);
        wash.addColorStop(0, "rgba(239, 246, 255, 0.82)");
        wash.addColorStop(0.34, "rgba(255, 255, 255, 0)");
        wash.addColorStop(1, "rgba(254, 249, 235, 0.5)");
        context.fillStyle = wash;
        context.fillRect(0, 0, width, height);

        context.fillStyle = template.primaryColor;
        context.fillRect(0, 0, width * 0.065, height);
        context.fillStyle = template.accentColor;
        context.fillRect(width * 0.065, 0, width * 0.009, height);

        context.fillStyle = `${template.primaryColor}0e`;
        context.beginPath();
        context.moveTo(width * 0.53, height);
        context.lineTo(width, height * 0.58);
        context.lineTo(width, height);
        context.closePath();
        context.fill();

        context.fillStyle = `${template.accentColor}24`;
        context.beginPath();
        context.moveTo(width * 0.74, height);
        context.lineTo(width, height * 0.77);
        context.lineTo(width, height);
        context.closePath();
        context.fill();

        context.strokeStyle = `${template.accentColor}66`;
        context.lineWidth = 3 * scale;
        context.beginPath();
        context.arc(width * 0.9, height * 0.09, 125 * scale, 0.28 * Math.PI, 1.55 * Math.PI);
        context.stroke();
        context.beginPath();
        context.arc(width * 0.9, height * 0.09, 155 * scale, 0.28 * Math.PI, 1.55 * Math.PI);
        context.stroke();

        context.fillStyle = template.accentColor;
        context.fillRect(width * 0.14, height * 0.345, width * 0.14, 3 * scale);
        context.fillRect(width * 0.65, height * 0.815, width * 0.2, 2 * scale);
        context.strokeStyle = `${template.primaryColor}55`;
        context.lineWidth = 1.5 * scale;
        context.strokeRect(22 * scale, 22 * scale, width - 44 * scale, height - 44 * scale);
        return;
    }

    if (template.design === "laurel") {
        const glow = context.createRadialGradient(width / 2, height * 0.44, 0, width / 2, height * 0.44, width * 0.52);
        glow.addColorStop(0, "rgba(255, 255, 255, 0.98)");
        glow.addColorStop(0.65, "rgba(255, 253, 244, 0.75)");
        glow.addColorStop(1, "rgba(219, 234, 254, 0.38)");
        context.fillStyle = glow;
        context.fillRect(0, 0, width, height);

        context.strokeStyle = template.primaryColor;
        context.lineWidth = 3 * scale;
        context.strokeRect(26 * scale, 26 * scale, width - 52 * scale, height - 52 * scale);
        context.strokeStyle = template.accentColor;
        context.lineWidth = 1.5 * scale;
        context.strokeRect(38 * scale, 38 * scale, width - 76 * scale, height - 76 * scale);
        context.strokeRect(48 * scale, 48 * scale, width - 96 * scale, height - 96 * scale);

        context.strokeStyle = `${template.accentColor}88`;
        context.lineWidth = 3 * scale;
        const corner = 92 * scale;
        for (const [x, y, xDirection, yDirection] of [
            [52 * scale, 52 * scale, 1, 1],
            [width - 52 * scale, 52 * scale, -1, 1],
            [52 * scale, height - 52 * scale, 1, -1],
            [width - 52 * scale, height - 52 * scale, -1, -1],
        ] as const) {
            context.beginPath();
            context.moveTo(x, y + yDirection * corner);
            context.quadraticCurveTo(x, y, x + xDirection * corner, y);
            context.stroke();
            context.beginPath();
            context.arc(x + xDirection * 24 * scale, y + yDirection * 24 * scale, 5 * scale, 0, Math.PI * 2);
            context.fillStyle = template.accentColor;
            context.fill();
        }

        context.fillStyle = `${template.primaryColor}0a`;
        context.beginPath();
        context.arc(width * 0.5, height * 0.49, width * 0.34, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = template.accentColor;
        context.fillRect(width * 0.33, height * 0.525, width * 0.34, 2 * scale);
        context.fillRect(width * 0.4, height * 0.815, width * 0.2, 2 * scale);
        return;
    }

    const wash = context.createLinearGradient(0, 0, width, height);
    wash.addColorStop(0, "rgba(219, 234, 254, 0.56)");
    wash.addColorStop(0.3, "rgba(255, 255, 255, 0)");
    wash.addColorStop(0.72, "rgba(255, 255, 255, 0)");
    wash.addColorStop(1, "rgba(254, 243, 199, 0.34)");
    context.fillStyle = wash;
    context.fillRect(0, 0, width, height);

    context.fillStyle = `${template.primaryColor}12`;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(width * 0.2, 0);
    context.lineTo(0, height * 0.32);
    context.closePath();
    context.fill();
    context.fillStyle = `${template.primaryColor}0d`;
    context.beginPath();
    context.moveTo(width, height);
    context.lineTo(width * 0.73, height);
    context.lineTo(width, height * 0.66);
    context.closePath();
    context.fill();

    context.fillStyle = `${template.accentColor}16`;
    context.beginPath();
    context.arc(width * 0.93, height * 0.12, 116 * scale, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.arc(width * 0.08, height * 0.88, 80 * scale, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = template.primaryColor;
    context.lineWidth = 5 * scale;
    context.strokeRect(28 * scale, 28 * scale, width - 56 * scale, height - 56 * scale);
    context.strokeStyle = template.accentColor;
    context.lineWidth = 2 * scale;
    context.strokeRect(42 * scale, 42 * scale, width - 84 * scale, height - 84 * scale);
    context.fillStyle = template.accentColor;
    context.fillRect(width * 0.31, height * 0.496, width * 0.38, 2 * scale);
    context.fillRect(width * 0.4, height * 0.815, width * 0.2, 2 * scale);
}

function fitLine(
    context: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
) {
    if (context.measureText(text).width <= maxWidth) return text;

    let fitted = text;
    while (fitted.length > 1 && context.measureText(`${fitted}…`).width > maxWidth) {
        fitted = fitted.slice(0, -1);
    }
    return `${fitted.trim()}…`;
}

function wrapText(
    context: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    maxLines: number,
) {
    const output: string[] = [];

    for (const paragraph of text.split("\n")) {
        const words = paragraph.trim().split(/\s+/).filter(Boolean);
        let line = "";
        for (const word of words) {
            const candidate = line ? `${line} ${word}` : word;
            if (!line || context.measureText(candidate).width <= maxWidth) {
                line = candidate;
            } else {
                output.push(line);
                line = word;
            }
        }
        if (line) output.push(line);
    }

    if (output.length <= maxLines) return output;
    const visible = output.slice(0, Math.max(0, maxLines - 1));
    visible.push(fitLine(context, output.slice(maxLines - 1).join(" "), maxWidth));
    return visible;
}

function drawTextElement(
    context: CanvasRenderingContext2D,
    element: CertificateTextElement,
    data: CertificateBindingData,
) {
    const scale = context.canvas.width / CERTIFICATE_DESIGN_WIDTH;
    const x = context.canvas.width * element.x / 100;
    const y = context.canvas.height * element.y / 100;
    const width = context.canvas.width * element.width / 100;
    const height = context.canvas.height * element.height / 100;
    const fontSize = element.fontSize * scale;
    const fontFamily = element.fontFamily === "serif" ? "Georgia, serif" : "Arial, sans-serif";
    const fontStyle = element.italic ? "italic" : "normal";
    const lineHeight = fontSize * element.lineHeight;

    context.save();
    context.fillStyle = element.color;
    context.font = `${fontStyle} ${element.fontWeight} ${fontSize}px ${fontFamily}`;
    context.textAlign = element.align;
    context.textBaseline = "top";

    const resolved = resolveCertificateText(element.content, data);
    const maxLines = Math.max(1, Math.floor(height / lineHeight));
    const lines = wrapText(context, resolved, width, maxLines);
    const textX = element.align === "left" ? x : element.align === "right" ? x + width : x + width / 2;
    const blockHeight = lines.length * lineHeight;
    const textY = y + Math.max(0, (height - blockHeight) / 2);
    lines.forEach((line, index) => context.fillText(fitLine(context, line, width), textX, textY + index * lineHeight));
    context.restore();
}

function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("A template image could not be loaded."));
        image.src = src;
    });
}

async function drawBackgroundImage(
    context: CanvasRenderingContext2D,
    template: CertificateTemplate,
) {
    if (!template.backgroundImage) return;

    const image = await loadImage(template.backgroundImage);
    const width = context.canvas.width;
    const height = context.canvas.height;
    const imageRatio = image.naturalWidth / image.naturalHeight;
    const canvasRatio = width / height;
    let drawWidth = width;
    let drawHeight = height;

    if ((template.backgroundImageFit === "contain" && imageRatio > canvasRatio)
        || (template.backgroundImageFit === "cover" && imageRatio < canvasRatio)) {
        drawHeight = width / imageRatio;
    } else {
        drawWidth = height * imageRatio;
    }

    context.save();
    context.globalAlpha = template.backgroundImageOpacity;
    context.drawImage(
        image,
        (width - drawWidth) / 2,
        (height - drawHeight) / 2,
        drawWidth,
        drawHeight,
    );
    context.restore();
}

async function drawImageElement(
    context: CanvasRenderingContext2D,
    element: CertificateImageElement,
) {
    const image = await loadImage(element.src);
    const x = context.canvas.width * element.x / 100;
    const y = context.canvas.height * element.y / 100;
    const width = context.canvas.width * element.width / 100;
    const height = context.canvas.height * element.height / 100;
    const imageRatio = image.naturalWidth / image.naturalHeight;
    const frameRatio = width / height;

    let drawWidth = width;
    let drawHeight = height;
    if ((element.objectFit === "contain" && imageRatio > frameRatio) ||
        (element.objectFit === "cover" && imageRatio < frameRatio)) {
        drawHeight = width / imageRatio;
    } else {
        drawWidth = height * imageRatio;
    }

    context.save();
    context.globalAlpha = element.opacity;
    if (element.objectFit === "cover") {
        context.beginPath();
        context.rect(x, y, width, height);
        context.clip();
    }
    context.drawImage(
        image,
        x + (width - drawWidth) / 2,
        y + (height - drawHeight) / 2,
        drawWidth,
        drawHeight,
    );
    context.restore();
}

export async function renderCertificateCanvas(
    template: CertificateTemplate,
    data: CertificateBindingData,
) {
    const canvas = document.createElement("canvas");
    canvas.width = CERTIFICATE_OUTPUT_WIDTH;
    canvas.height = CERTIFICATE_OUTPUT_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas rendering is unavailable in this browser.");

    context.fillStyle = template.backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    await drawBackgroundImage(context, template);
    if (template.showFoundation) {
        context.save();
        context.globalAlpha = template.foundationOpacity;
        drawCertificateFoundation(context, template);
        context.restore();
    }
    const elements = [...template.elements].sort((left, right) => left.zIndex - right.zIndex);
    for (const element of elements) {
        if (element.type === "image") await drawImageElement(context, element);
        else drawTextElement(context, element, data);
    }

    return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: "image/png" | "image/jpeg", quality?: number) {
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (blob) => blob ? resolve(blob) : reject(new Error("The certificate file could not be created.")),
            type,
            quality,
        );
    });
}

export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
