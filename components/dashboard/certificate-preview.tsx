"use client";

import Image from "next/image";
import { Move } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
    type CertificateBindingData,
    type CertificateElement,
    type CertificateTemplate,
    type CertificateTextElement,
    resolveCertificateText,
} from "@/lib/certificates";

type CertificatePreviewProps = {
    template: CertificateTemplate;
    data: CertificateBindingData;
    selectedElementId?: string | null;
    onElementPointerDown?: (
        event: React.PointerEvent<HTMLDivElement>,
        element: CertificateElement,
    ) => void;
    onElementSelect?: (element: CertificateElement) => void;
    onElementResizePointerDown?: (
        event: React.PointerEvent<HTMLDivElement>,
        element: CertificateElement,
    ) => void;
    editingTextElementId?: string | null;
    onTextElementEditStart?: (element: CertificateTextElement) => void;
    onTextElementChange?: (element: CertificateTextElement, content: string) => void;
    onTextElementEditEnd?: (element: CertificateTextElement) => void;
};

export function CertificatePreview({
    template,
    data,
    selectedElementId,
    onElementPointerDown,
    onElementSelect,
    onElementResizePointerDown,
    editingTextElementId,
    onTextElementEditStart,
    onTextElementChange,
    onTextElementEditEnd,
}: CertificatePreviewProps) {
    const interactive = Boolean(
        onElementPointerDown
        || onElementSelect
        || onElementResizePointerDown
        || onTextElementEditStart,
    );

    return (
        <div
            className="relative aspect-[297/210] w-full overflow-hidden shadow-[0_30px_80px_-35px_rgba(15,23,42,0.45)]"
            style={{
                backgroundColor: template.backgroundColor,
                containerType: "inline-size",
            }}
        >
            {template.backgroundImage ? (
                <Image
                    src={template.backgroundImage}
                    alt=""
                    fill
                    unoptimized
                    aria-hidden="true"
                    draggable={false}
                    sizes="100vw"
                    style={{
                        objectFit: template.backgroundImageFit,
                        opacity: template.backgroundImageOpacity,
                    }}
                />
            ) : null}
            {template.showFoundation ? (
                <div
                    className="pointer-events-none absolute inset-0"
                    style={{ opacity: template.foundationOpacity }}
                >
                    <CertificateFrame template={template} />
                </div>
            ) : null}

            {[...template.elements]
                .sort((left, right) => left.zIndex - right.zIndex)
                .map((element) => {
                    const selected = selectedElementId === element.id;
                    const commonStyle = {
                        left: `${element.x}%`,
                        top: `${element.y}%`,
                        width: `${element.width}%`,
                        height: `${element.height}%`,
                        zIndex: element.zIndex,
                    };

                    if (element.type === "image") {
                        return (
                            <div
                                key={element.id}
                                role={interactive ? "button" : undefined}
                                tabIndex={interactive ? 0 : undefined}
                                className={`absolute ${interactive ? "cursor-move touch-none" : "pointer-events-none"} ${selected ? "ring-[0.25cqw] ring-sky-500 ring-offset-[0.18cqw]" : ""}`}
                                style={{ ...commonStyle, opacity: element.opacity }}
                                onPointerDown={(event) => onElementPointerDown?.(event, element)}
                                onClick={() => onElementSelect?.(element)}
                            >
                                <Image
                                    src={element.src}
                                    alt={element.alt}
                                    fill
                                    unoptimized
                                    draggable={false}
                                    sizes="50vw"
                                    style={{ objectFit: element.objectFit }}
                                />
                                {selected && onElementResizePointerDown ? (
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`Resize ${element.alt || "image"}`}
                                        title="Drag to resize image"
                                        className="absolute -bottom-[0.7cqw] -right-[0.7cqw] z-20 h-[1.6cqw] min-h-3 w-[1.6cqw] min-w-3 cursor-se-resize touch-none rounded-full border-[0.2cqw] border-white bg-sky-600 shadow-md"
                                        onPointerDown={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            onElementResizePointerDown(event, element);
                                        }}
                                    />
                                ) : null}
                            </div>
                        );
                    }

                    const editing = editingTextElementId === element.id;
                    const canvasEditable = Boolean(onTextElementChange);

                    return (
                        <div
                            key={element.id}
                            role={interactive && !canvasEditable ? "button" : undefined}
                            tabIndex={interactive && !canvasEditable ? 0 : undefined}
                            aria-label={interactive && !canvasEditable ? `Select text: ${resolveCertificateText(element.content, data)}` : undefined}
                            className={`absolute flex items-center whitespace-pre-wrap ${interactive ? canvasEditable ? "cursor-text" : "cursor-move touch-none select-none" : "pointer-events-none overflow-hidden"} ${selected ? "ring-[0.25cqw] ring-sky-500 ring-offset-[0.18cqw]" : ""}`}
                            style={{
                                ...commonStyle,
                                color: element.color,
                                fontFamily: element.fontFamily === "serif" ? "Georgia, serif" : "Arial, sans-serif",
                                fontSize: `${element.fontSize / 14}cqw`,
                                fontWeight: element.fontWeight,
                                fontStyle: element.italic ? "italic" : "normal",
                                lineHeight: element.lineHeight,
                                justifyContent: element.align === "left"
                                    ? "flex-start"
                                    : element.align === "right"
                                        ? "flex-end"
                                    : "center",
                                textAlign: element.align,
                            }}
                            onPointerDown={(event) => {
                                if (!canvasEditable && !editing) onElementPointerDown?.(event, element);
                            }}
                            onClick={() => {
                                if (!canvasEditable) onElementSelect?.(element);
                            }}
                            onDoubleClick={(event) => {
                                if (!onTextElementEditStart) return;
                                event.preventDefault();
                                event.stopPropagation();
                                onTextElementEditStart(element);
                            }}
                            onKeyDown={(event) => {
                                if (editing || !onTextElementEditStart || (event.key !== "Enter" && event.key !== "F2")) return;
                                event.preventDefault();
                                onTextElementEditStart(element);
                            }}
                        >
                            {canvasEditable && onTextElementChange ? (
                                <EditableCanvasText
                                    element={element}
                                    selected={selected}
                                    onSelect={onElementSelect}
                                    onEditStart={onTextElementEditStart}
                                    onChange={onTextElementChange}
                                    onFinish={onTextElementEditEnd}
                                />
                            ) : (
                                <span className="w-full">{resolveCertificateText(element.content, data)}</span>
                            )}
                            {selected && canvasEditable && onElementPointerDown ? (
                                <div
                                    role="button"
                                    tabIndex={0}
                                    aria-label="Drag to move this text"
                                    title="Drag to move text"
                                    className="absolute -right-[0.8cqw] -top-[0.8cqw] z-20 flex h-[1.8cqw] min-h-3 w-[1.8cqw] min-w-3 cursor-move touch-none items-center justify-center rounded-full border-[0.18cqw] border-white bg-sky-600 text-white shadow-md"
                                    onPointerDown={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        onElementPointerDown(event, element);
                                    }}
                                >
                                    <Move className="h-[1cqw] min-h-2.5 w-[1cqw] min-w-2.5" aria-hidden="true" />
                                </div>
                            ) : null}
                        </div>
                    );
                })}
        </div>
    );
}

function EditableCanvasText({
    element,
    selected,
    onSelect,
    onEditStart,
    onChange,
    onFinish,
}: {
    element: CertificateTextElement;
    selected: boolean;
    onSelect?: (element: CertificateElement) => void;
    onEditStart?: (element: CertificateTextElement) => void;
    onChange: (element: CertificateTextElement, content: string) => void;
    onFinish?: (element: CertificateTextElement) => void;
}) {
    const editorRef = useRef<HTMLDivElement>(null);
    const initialContentRef = useRef(element.content);
    const lastEmittedContentRef = useRef(element.content);

    useLayoutEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;

        editor.innerText = initialContentRef.current;
    }, [element.id]);

    useEffect(() => {
        const editor = editorRef.current;
        if (editor && element.content !== lastEmittedContentRef.current) {
            if (editor.innerText !== element.content) {
                editor.innerText = element.content;
            }
            lastEmittedContentRef.current = element.content;
        }
    }, [element.content]);

    return (
        <div
            ref={editorRef}
            aria-label="Edit certificate text"
            aria-multiline="true"
            role="textbox"
            tabIndex={0}
            contentEditable
            suppressContentEditableWarning
            spellCheck
            className={`max-h-full w-full cursor-text select-text overflow-hidden whitespace-pre-wrap outline-none ${selected ? "caret-current" : ""}`}
            style={{
                caretColor: element.color,
            }}
            onPointerDown={(event) => {
                event.stopPropagation();
                onSelect?.(element);
            }}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onFocus={() => {
                onSelect?.(element);
                onEditStart?.(element);
            }}
            onInput={(event) => {
                const content = event.currentTarget.innerText.replace(/\r/g, "");
                lastEmittedContentRef.current = content;
                onChange(element, content);
            }}
            onBlur={() => onFinish?.(element)}
            onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Escape") {
                    event.preventDefault();
                    event.currentTarget.blur();
                }
            }}
        />
    );
}

function CertificateFrame({ template }: { template: CertificateTemplate }) {
    if (template.design === "horizon") {
        return (
            <>
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(239,246,255,0.82),transparent_34%,rgba(254,249,235,0.5))]" />
                <div className="pointer-events-none absolute inset-y-0 left-0 w-[6.5%]" style={{ backgroundColor: template.primaryColor }} />
                <div className="pointer-events-none absolute inset-y-0 left-[6.5%] w-[0.9%]" style={{ backgroundColor: template.accentColor }} />
                <div className="pointer-events-none absolute bottom-0 right-0 h-[42%] w-[47%] [clip-path:polygon(100%_0,100%_100%,0_100%)]" style={{ backgroundColor: `${template.primaryColor}0e` }} />
                <div className="pointer-events-none absolute bottom-0 right-0 h-[23%] w-[26%] [clip-path:polygon(100%_0,100%_100%,0_100%)]" style={{ backgroundColor: `${template.accentColor}24` }} />
                <div className="pointer-events-none absolute -right-[1%] -top-[10%] aspect-square w-[22%] rounded-full border-[0.2cqw]" style={{ borderColor: `${template.accentColor}66` }} />
                <div className="pointer-events-none absolute right-[1%] -top-[7%] aspect-square w-[18%] rounded-full border-[0.2cqw]" style={{ borderColor: `${template.accentColor}66` }} />
                <div className="pointer-events-none absolute left-[14%] top-[34.5%] h-[0.22cqw] w-[14%]" style={{ backgroundColor: template.accentColor }} />
                <div className="pointer-events-none absolute bottom-[18.5%] left-[65%] h-px w-[20%]" style={{ backgroundColor: template.accentColor }} />
                <div className="pointer-events-none absolute inset-[1.55%] border-[0.1cqw]" style={{ borderColor: `${template.primaryColor}55` }} />
            </>
        );
    }

    if (template.design === "laurel") {
        return (
            <>
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,rgba(255,255,255,0.98),rgba(255,253,244,0.75)_65%,rgba(219,234,254,0.38))]" />
                <div className="pointer-events-none absolute inset-[1.9%] border-[0.22cqw]" style={{ borderColor: template.primaryColor }} />
                <div className="pointer-events-none absolute inset-[2.7%] border-[0.1cqw]" style={{ borderColor: template.accentColor }} />
                <div className="pointer-events-none absolute inset-[3.45%] border-[0.08cqw]" style={{ borderColor: template.accentColor }} />
                <div className="pointer-events-none absolute left-[3.7%] top-[3.7%] h-[8%] w-[8%] rounded-tl-[100%] border-l-[0.2cqw] border-t-[0.2cqw]" style={{ borderColor: `${template.accentColor}88` }} />
                <div className="pointer-events-none absolute right-[3.7%] top-[3.7%] h-[8%] w-[8%] rounded-tr-[100%] border-r-[0.2cqw] border-t-[0.2cqw]" style={{ borderColor: `${template.accentColor}88` }} />
                <div className="pointer-events-none absolute bottom-[3.7%] left-[3.7%] h-[8%] w-[8%] rounded-bl-[100%] border-b-[0.2cqw] border-l-[0.2cqw]" style={{ borderColor: `${template.accentColor}88` }} />
                <div className="pointer-events-none absolute bottom-[3.7%] right-[3.7%] h-[8%] w-[8%] rounded-br-[100%] border-b-[0.2cqw] border-r-[0.2cqw]" style={{ borderColor: `${template.accentColor}88` }} />
                <div className="pointer-events-none absolute left-[16%] top-[20%] aspect-square w-[68%] rounded-full" style={{ backgroundColor: `${template.primaryColor}0a` }} />
                <div className="pointer-events-none absolute left-[33%] top-[52.5%] h-px w-[34%]" style={{ backgroundColor: template.accentColor }} />
                <div className="pointer-events-none absolute bottom-[18.5%] left-[40%] h-px w-[20%]" style={{ backgroundColor: template.accentColor }} />
            </>
        );
    }

    return (
        <>
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(219,234,254,0.56),transparent_30%,transparent_72%,rgba(254,243,199,0.34))]" />
            <div className="pointer-events-none absolute left-0 top-0 h-[32%] w-[20%] [clip-path:polygon(0_0,100%_0,0_100%)]" style={{ backgroundColor: `${template.primaryColor}12` }} />
            <div className="pointer-events-none absolute bottom-0 right-0 h-[34%] w-[27%] [clip-path:polygon(100%_0,100%_100%,0_100%)]" style={{ backgroundColor: `${template.primaryColor}0d` }} />
            <div className="pointer-events-none absolute right-[1.5%] top-[1.5%] aspect-square w-[16%] rounded-full" style={{ backgroundColor: `${template.accentColor}16` }} />
            <div className="pointer-events-none absolute bottom-[3%] left-[2%] aspect-square w-[11%] rounded-full" style={{ backgroundColor: `${template.accentColor}16` }} />
            <div className="pointer-events-none absolute inset-[2%] border-[0.34cqw]" style={{ borderColor: template.primaryColor }} />
            <div className="pointer-events-none absolute inset-[3%] border-[0.14cqw]" style={{ borderColor: template.accentColor }} />
            <div className="pointer-events-none absolute left-[31%] top-[49.6%] h-px w-[38%]" style={{ backgroundColor: template.accentColor }} />
            <div className="pointer-events-none absolute bottom-[18.5%] left-[40%] h-px w-[20%]" style={{ backgroundColor: template.accentColor }} />
        </>
    );
}
