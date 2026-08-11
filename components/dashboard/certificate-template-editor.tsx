"use client";

import { useRef, useState } from "react";
import {
    CircleAlert,
    Copy,
    ImagePlus,
    Layers3,
    LoaderCircle,
    Move,
    PlusCircle,
    Save,
    Trash2,
    X,
} from "lucide-react";
import { CertificatePreview } from "@/components/dashboard/certificate-preview";
import {
    SAMPLE_CERTIFICATE_DATA,
    type CertificateElement,
    type CertificateDesign,
    type CertificateImageElement,
    type CertificateTemplate,
    type CertificateTextElement,
} from "@/lib/certificates";
import { saveBrowserCertificateTemplate } from "@/lib/certificate-template-storage";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";

type CertificateTemplateEditorProps = {
    baseTemplate: CertificateTemplate;
    onClose: () => void;
    onSaved: (template: CertificateTemplate, storedInBrowser: boolean) => void;
};

function clamp(value: number, minimum: number, maximum: number) {
    return Math.min(maximum, Math.max(minimum, value));
}

function createElementId(prefix: string) {
    return `${prefix}-${crypto.randomUUID()}`;
}

export function CertificateTemplateEditor({
    baseTemplate,
    onClose,
    onSaved,
}: CertificateTemplateEditorProps) {
    const [draft, setDraft] = useState<CertificateTemplate>(() => ({
        ...baseTemplate,
        id: "draft",
        name: baseTemplate.id === "blank-certificate-draft"
            ? baseTemplate.name
            : `${baseTemplate.name} Custom`,
        backgroundImage: baseTemplate.backgroundImage || null,
        backgroundImageFit: baseTemplate.backgroundImageFit || "cover",
        backgroundImageOpacity: baseTemplate.backgroundImageOpacity ?? 1,
        showFoundation: baseTemplate.showFoundation ?? true,
        foundationOpacity: baseTemplate.foundationOpacity ?? 1,
        elements: baseTemplate.elements.map((element) => ({ ...element })),
    }));
    const [selectedElementId, setSelectedElementId] = useState<string | null>(
        draft.elements[0]?.id || null,
    );
    const [editingTextElementId, setEditingTextElementId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const previewRef = useRef<HTMLDivElement>(null);
    const draggedElementIdRef = useRef<string | null>(null);

    const selectedElement = draft.elements.find((element) => element.id === selectedElementId) || null;

    function updateElement(id: string, updates: Partial<CertificateElement>) {
        setDraft((current) => ({
            ...current,
            elements: current.elements.map((element) =>
                element.id === id ? { ...element, ...updates } as CertificateElement : element,
            ),
        }));
    }

    function updateSelectedElement(updates: Partial<CertificateElement>) {
        if (selectedElementId) updateElement(selectedElementId, updates);
    }

    function removeSelectedElement() {
        if (!selectedElementId) return;
        setDraft((current) => ({
            ...current,
            elements: current.elements.filter((element) => element.id !== selectedElementId),
        }));
        setSelectedElementId(null);
        setEditingTextElementId(null);
    }

    function duplicateSelectedElement() {
        if (!selectedElement) return;
        const duplicate = {
            ...selectedElement,
            id: createElementId(selectedElement.type),
            x: clamp(selectedElement.x + 2, 0, 100 - selectedElement.width),
            y: clamp(selectedElement.y + 2, 0, 100 - selectedElement.height),
            zIndex: Math.min(1000, Math.max(...draft.elements.map((item) => item.zIndex), 0) + 1),
        } as CertificateElement;
        setDraft((current) => ({ ...current, elements: [...current.elements, duplicate] }));
        setSelectedElementId(duplicate.id);
        setEditingTextElementId(duplicate.type === "text" ? duplicate.id : null);
    }

    function selectOrEditElement(element: CertificateElement) {
        if (draggedElementIdRef.current === element.id) {
            draggedElementIdRef.current = null;
            return;
        }

        setSelectedElementId(element.id);
        setEditingTextElementId(element.type === "text" ? element.id : null);
    }

    function beginElementDrag(
        pointerEvent: React.PointerEvent<HTMLDivElement>,
        element: CertificateElement,
    ) {
        const preview = previewRef.current;
        if (!preview) return;

        pointerEvent.stopPropagation();
        setSelectedElementId(element.id);
        setEditingTextElementId(null);

        const bounds = preview.getBoundingClientRect();
        const startX = pointerEvent.clientX;
        const startY = pointerEvent.clientY;
        const originalX = element.x;
        const originalY = element.y;
        let didDrag = false;

        function moveElement(moveEvent: PointerEvent) {
            const deltaX = moveEvent.clientX - startX;
            const deltaY = moveEvent.clientY - startY;
            if (!didDrag && Math.hypot(deltaX, deltaY) < 3) return;

            didDrag = true;
            draggedElementIdRef.current = element.id;
            const nextX = clamp(originalX + deltaX / bounds.width * 100, 0, 100 - element.width);
            const nextY = clamp(originalY + deltaY / bounds.height * 100, 0, 100 - element.height);
            updateElement(element.id, { x: Number(nextX.toFixed(2)), y: Number(nextY.toFixed(2)) });
        }

        function finishDrag() {
            window.removeEventListener("pointermove", moveElement);
            window.removeEventListener("pointerup", finishDrag);
            window.removeEventListener("pointercancel", finishDrag);
            if (didDrag) {
                window.setTimeout(() => {
                    if (draggedElementIdRef.current === element.id) {
                        draggedElementIdRef.current = null;
                    }
                }, 0);
            }
        }

        window.addEventListener("pointermove", moveElement);
        window.addEventListener("pointerup", finishDrag, { once: true });
        window.addEventListener("pointercancel", finishDrag, { once: true });
    }

    function beginElementResize(
        pointerEvent: React.PointerEvent<HTMLDivElement>,
        element: CertificateElement,
    ) {
        const preview = previewRef.current;
        if (!preview) return;

        pointerEvent.preventDefault();
        pointerEvent.stopPropagation();
        setSelectedElementId(element.id);

        const bounds = preview.getBoundingClientRect();
        const startX = pointerEvent.clientX;
        const startY = pointerEvent.clientY;
        const originalWidth = element.width;
        const originalHeight = element.height;

        function resizeElement(moveEvent: PointerEvent) {
            const nextWidth = clamp(
                originalWidth + (moveEvent.clientX - startX) / bounds.width * 100,
                2,
                100 - element.x,
            );
            const nextHeight = clamp(
                originalHeight + (moveEvent.clientY - startY) / bounds.height * 100,
                2,
                100 - element.y,
            );
            updateElement(element.id, {
                width: Number(nextWidth.toFixed(2)),
                height: Number(nextHeight.toFixed(2)),
            });
        }

        function finishResize() {
            window.removeEventListener("pointermove", resizeElement);
            window.removeEventListener("pointerup", finishResize);
            window.removeEventListener("pointercancel", finishResize);
        }

        window.addEventListener("pointermove", resizeElement);
        window.addEventListener("pointerup", finishResize, { once: true });
        window.addEventListener("pointercancel", finishResize, { once: true });
    }

    function addTextElement() {
        const element: CertificateTextElement = {
            id: createElementId("text"),
            type: "text",
            x: 30,
            y: 76,
            width: 40,
            height: 6,
            zIndex: Math.max(2, ...draft.elements.map((item) => item.zIndex + 1)),
            content: "Edit this text",
            color: draft.primaryColor,
            fontFamily: "sans",
            fontSize: 22,
            fontWeight: 600,
            align: "center",
            lineHeight: 1.2,
            italic: false,
        };
        setDraft((current) => ({ ...current, elements: [...current.elements, element] }));
        setSelectedElementId(element.id);
        setEditingTextElementId(element.id);
    }

    function addImageFile(
        file: File,
        position?: { x: number; y: number },
        replaceElementId?: string,
    ) {
        setError(null);
        if (!/image\/(png|jpeg|webp)/i.test(file.type)) {
            setError("Use a PNG, JPEG, or WebP image.");
            return;
        }
        if (file.size > 2_500_000) {
            setError("Keep each uploaded image below 2.5 MB.");
            return;
        }

        const reader = new FileReader();
        reader.onerror = () => setError("The image could not be read.");
        reader.onload = () => {
            if (typeof reader.result !== "string") return;
            if (replaceElementId) {
                updateElement(replaceElementId, {
                    src: reader.result,
                    alt: file.name.replace(/\.[^.]+$/, ""),
                });
                return;
            }
            const element: CertificateImageElement = {
                id: createElementId("image"),
                type: "image",
                x: clamp((position?.x ?? 50) - 7, 0, 86),
                y: clamp((position?.y ?? 18) - 7, 0, 86),
                width: 14,
                height: 14,
                zIndex: Math.max(3, ...draft.elements.map((item) => item.zIndex + 1)),
                src: reader.result,
                alt: file.name.replace(/\.[^.]+$/, ""),
                objectFit: "contain",
                opacity: 1,
            };
            setDraft((current) => ({ ...current, elements: [...current.elements, element] }));
            setSelectedElementId(element.id);
        };
        reader.readAsDataURL(file);
    }

    function setBackgroundFile(file: File) {
        setError(null);
        if (!/image\/(png|jpeg|webp)/i.test(file.type)) {
            setError("Use a PNG, JPEG, or WebP background image.");
            return;
        }
        if (file.size > 2_500_000) {
            setError("Keep the background image below 2.5 MB.");
            return;
        }

        const reader = new FileReader();
        reader.onerror = () => setError("The background image could not be read.");
        reader.onload = () => {
            if (typeof reader.result !== "string") return;
            setDraft((current) => ({ ...current, backgroundImage: reader.result as string }));
        };
        reader.readAsDataURL(file);
    }

    function handleImageDrop(dropEvent: React.DragEvent<HTMLDivElement>) {
        dropEvent.preventDefault();
        const file = dropEvent.dataTransfer.files[0];
        const preview = previewRef.current;
        if (!file || !preview) return;
        const bounds = preview.getBoundingClientRect();
        addImageFile(file, {
            x: (dropEvent.clientX - bounds.left) / bounds.width * 100,
            y: (dropEvent.clientY - bounds.top) / bounds.height * 100,
        });
    }

    async function saveTemplate() {
        setError(null);
        if (draft.name.trim().length < 2) {
            setError("Enter a template name before saving.");
            return;
        }

        setIsSaving(true);
        try {
            const { template } = await authenticatedFetch<{ template: CertificateTemplate }>(
                "/api/certificates/templates",
                {
                    method: "POST",
                    body: JSON.stringify({
                        name: draft.name.trim(),
                        design: draft.design,
                        backgroundColor: draft.backgroundColor,
                        backgroundImage: draft.backgroundImage,
                        backgroundImageFit: draft.backgroundImageFit,
                        backgroundImageOpacity: draft.backgroundImageOpacity,
                        primaryColor: draft.primaryColor,
                        accentColor: draft.accentColor,
                        showFoundation: draft.showFoundation,
                        foundationOpacity: draft.foundationOpacity,
                        elements: draft.elements,
                    }),
                },
            );
            try {
                saveBrowserCertificateTemplate(template);
            } catch {
                // The shared Supabase copy remains the source of truth if the
                // browser cache is full or unavailable.
            }
            onSaved(template, false);
        } catch (saveError) {
            const now = new Date().toISOString();
            const browserTemplate: CertificateTemplate = {
                ...draft,
                id: crypto.randomUUID(),
                name: draft.name.trim(),
                created_at: now,
                updated_at: now,
            };
            try {
                saveBrowserCertificateTemplate(browserTemplate);
                onSaved(browserTemplate, true);
            } catch {
                setError(saveError instanceof Error
                    ? `${saveError.message} The browser copy could not be saved either.`
                    : "Unable to save the template.");
            }
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/75 p-3 backdrop-blur-md sm:p-6">
            <div className="mx-auto min-h-full max-w-[1600px] rounded-[30px] border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-700 dark:bg-slate-950">
                <header className="sticky top-0 z-20 flex flex-col gap-4 rounded-t-[30px] border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-600 dark:text-amber-300">Template studio</p>
                        <h2 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">Edit every certificate element</h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={addTextElement} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                            <PlusCircle size={16} /> Add text
                        </button>
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                            <ImagePlus size={16} /> Add image
                            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) addImageFile(file);
                                event.target.value = "";
                            }} />
                        </label>
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 transition hover:border-amber-400 hover:bg-amber-100 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200">
                            <ImagePlus size={16} /> {draft.backgroundImage ? "Replace background" : "Certificate background"}
                            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) setBackgroundFile(file);
                                event.target.value = "";
                            }} />
                        </label>
                        <button type="button" onClick={saveTemplate} disabled={isSaving} className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:opacity-60">
                            {isSaving ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
                            {isSaving ? "Saving…" : "Save as new template"}
                        </button>
                        <button type="button" onClick={onClose} disabled={isSaving} aria-label="Close template editor" className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"><X size={18} /></button>
                    </div>
                </header>

                <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:p-7">
                    <section className="space-y-4">
                        {error ? (
                            <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300"><CircleAlert size={16} /> {error}</div>
                        ) : null}
                        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                            <Move size={16} /> Click anywhere in the certificate text to place the typing cursor. Drag a selected text layer by its blue move handle. Press Escape when done.
                        </div>
                        <div
                            ref={previewRef}
                            className="overflow-hidden rounded-xl border border-slate-300 bg-white dark:border-slate-700"
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={handleImageDrop}
                        >
                            <CertificatePreview
                                template={draft}
                                data={SAMPLE_CERTIFICATE_DATA}
                                selectedElementId={selectedElementId}
                                editingTextElementId={editingTextElementId}
                                onElementPointerDown={beginElementDrag}
                                onElementSelect={selectOrEditElement}
                                onElementResizePointerDown={beginElementResize}
                                onTextElementEditStart={(element) => {
                                    setSelectedElementId(element.id);
                                    setEditingTextElementId(element.id);
                                }}
                                onTextElementChange={(element, content) => updateElement(element.id, { content })}
                                onTextElementEditEnd={(element) => {
                                    setEditingTextElementId((current) => current === element.id ? null : current);
                                }}
                            />
                        </div>
                    </section>

                    <aside className="space-y-5 rounded-[24px] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Template name</label>
                            <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} maxLength={120} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                        </div>

                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Design foundation
                            <select value={draft.design} onChange={(event) => setDraft((current) => ({ ...current, design: event.target.value as CertificateDesign }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                                <option value="signature">Signature · Refined classic</option>
                                <option value="horizon">Modern Horizon · Editorial</option>
                                <option value="laurel">Heritage Laurel · Ceremonial</option>
                            </select>
                        </label>

                        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Background image</p>
                                    <p className="mt-1 text-xs leading-5 text-slate-500">Optional full-page PNG, JPEG, or WebP.</p>
                                </div>
                                {draft.backgroundImage ? (
                                    <button type="button" onClick={() => setDraft((current) => ({ ...current, backgroundImage: null }))} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-400/10">Remove</button>
                                ) : null}
                            </div>
                            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 dark:border-sky-400/25 dark:bg-slate-900 dark:text-sky-300">
                                <ImagePlus size={16} /> {draft.backgroundImage ? "Replace background" : "Upload background"}
                                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (file) setBackgroundFile(file);
                                    event.target.value = "";
                                }} />
                            </label>
                            {draft.backgroundImage ? (
                                <div className="grid grid-cols-2 gap-3">
                                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Image fit
                                        <select value={draft.backgroundImageFit} onChange={(event) => setDraft((current) => ({ ...current, backgroundImageFit: event.target.value as CertificateTemplate["backgroundImageFit"] }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                                            <option value="cover">Cover page</option>
                                            <option value="contain">Fit inside</option>
                                        </select>
                                    </label>
                                    <NumberControl label="Opacity %" value={Math.round(draft.backgroundImageOpacity * 100)} minimum={5} maximum={100} onChange={(opacity) => setDraft((current) => ({ ...current, backgroundImageOpacity: opacity / 100 }))} />
                                </div>
                            ) : null}
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            {([
                                ["Background", "backgroundColor"],
                                ["Blue", "primaryColor"],
                                ["Gold", "accentColor"],
                            ] as const).map(([label, key]) => (
                                <label key={key} className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                    <span className="mb-2 block">{label}</span>
                                    <input type="color" value={draft[key]} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} className="h-10 w-full cursor-pointer rounded-lg border-0 bg-transparent" />
                                </label>
                            ))}
                        </div>

                        <div className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                            <label className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                <span>Show decorative foundation</span>
                                <input type="checkbox" checked={draft.showFoundation} onChange={(event) => setDraft((current) => ({ ...current, showFoundation: event.target.checked }))} className="h-4 w-4 accent-sky-700" />
                            </label>
                            {draft.showFoundation ? (
                                <NumberControl label="Foundation opacity %" value={Math.round(draft.foundationOpacity * 100)} minimum={5} maximum={100} onChange={(opacity) => setDraft((current) => ({ ...current, foundationOpacity: opacity / 100 }))} />
                            ) : null}
                        </div>

                        <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><Layers3 size={17} className="text-sky-600" /> All element layers</h3>
                                <span className="text-xs font-semibold text-slate-400">{draft.elements.length}/40</span>
                            </div>
                            <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
                                {[...draft.elements].sort((left, right) => right.zIndex - left.zIndex).map((element) => (
                                    <button key={element.id} type="button" onClick={() => {
                                        setSelectedElementId(element.id);
                                        setEditingTextElementId(null);
                                    }} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${selectedElementId === element.id ? "border-sky-400 bg-sky-50 text-sky-800 dark:bg-sky-400/10 dark:text-sky-200" : "border-transparent bg-slate-50 text-slate-600 hover:border-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-slate-700"}`}>
                                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm dark:bg-slate-900">{element.type === "image" ? <ImagePlus size={14} /> : <span className="text-xs font-bold">T</span>}</span>
                                        <span className="min-w-0 flex-1 truncate">{element.type === "text" ? element.content.replace(/\s+/g, " ") || "Empty text" : element.alt || "Image"}</span>
                                        <span className="text-[10px] font-semibold text-slate-400">{element.zIndex}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
                            <div className="flex items-center justify-between gap-3">
                                <h3 className="font-semibold text-slate-900 dark:text-white">Selected element</h3>
                                {selectedElement ? (
                                    <div className="flex items-center gap-1">
                                        <button type="button" onClick={duplicateSelectedElement} aria-label="Duplicate selected element" className="rounded-lg p-2 text-sky-700 transition hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-400/10"><Copy size={16} /></button>
                                        <button type="button" onClick={removeSelectedElement} aria-label="Remove selected element" className="rounded-lg p-2 text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-400/10"><Trash2 size={16} /></button>
                                    </div>
                                ) : null}
                            </div>

                            {selectedElement ? (
                                <div className="mt-4 space-y-4">
                                    {selectedElement.type === "text" ? (
                                        <>
                                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                                                <span className="mb-2 block">Text</span>
                                                <textarea value={selectedElement.content} onChange={(event) => updateSelectedElement({ content: event.target.value })} rows={4} className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                                                <span className="mt-2 block leading-5">Variables: {"{{recipientName}}"}, {"{{eventName}}"}, {"{{eventDate}}"}, {"{{issuer}}"}</span>
                                            </label>
                                            <div className="grid grid-cols-2 gap-3">
                                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Font
                                                    <select value={selectedElement.fontFamily} onChange={(event) => updateSelectedElement({ fontFamily: event.target.value as CertificateTextElement["fontFamily"] })} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                                                        <option value="sans">Sans serif</option>
                                                        <option value="serif">Serif</option>
                                                    </select>
                                                </label>
                                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Alignment
                                                    <select value={selectedElement.align} onChange={(event) => updateSelectedElement({ align: event.target.value as CertificateTextElement["align"] })} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                                                        <option value="left">Left</option>
                                                        <option value="center">Center</option>
                                                        <option value="right">Right</option>
                                                    </select>
                                                </label>
                                                <NumberControl label="Font size" value={selectedElement.fontSize} minimum={8} maximum={160} onChange={(fontSize) => updateSelectedElement({ fontSize })} />
                                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Text color
                                                    <input type="color" value={selectedElement.color} onChange={(event) => updateSelectedElement({ color: event.target.value })} className="mt-2 h-9 w-full cursor-pointer rounded-lg" />
                                                </label>
                                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Font weight
                                                    <select value={selectedElement.fontWeight} onChange={(event) => updateSelectedElement({ fontWeight: Number(event.target.value) as CertificateTextElement["fontWeight"] })} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                                                        <option value="400">Regular</option>
                                                        <option value="500">Medium</option>
                                                        <option value="600">Semibold</option>
                                                        <option value="700">Bold</option>
                                                    </select>
                                                </label>
                                                <NumberControl label="Line height" value={selectedElement.lineHeight} minimum={0.8} maximum={2.5} step={0.05} onChange={(lineHeight) => updateSelectedElement({ lineHeight })} />
                                            </div>
                                            <div className="flex gap-2">
                                                <button type="button" onClick={() => updateSelectedElement({ italic: !selectedElement.italic })} className={`flex-1 rounded-xl border px-3 py-2 text-sm italic ${selectedElement.italic ? "border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300" : "border-slate-200 dark:border-slate-700"}`}>Italic</button>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-300">
                                                <ImagePlus size={16} /> Replace image
                                                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => {
                                                    const file = event.target.files?.[0];
                                                    if (file) addImageFile(file, undefined, selectedElement.id);
                                                    event.target.value = "";
                                                }} />
                                            </label>
                                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Image label
                                                <input value={selectedElement.alt} onChange={(event) => updateSelectedElement({ alt: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                                            </label>
                                            <div className="grid grid-cols-2 gap-3">
                                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Image fit
                                                    <select value={selectedElement.objectFit} onChange={(event) => updateSelectedElement({ objectFit: event.target.value as CertificateImageElement["objectFit"] })} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                                                        <option value="contain">Contain</option>
                                                        <option value="cover">Cover</option>
                                                    </select>
                                                </label>
                                                <NumberControl label="Opacity %" value={Math.round(selectedElement.opacity * 100)} minimum={5} maximum={100} onChange={(opacity) => updateSelectedElement({ opacity: opacity / 100 })} />
                                            </div>
                                        </>
                                    )}

                                    <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                                        <NumberControl label="X position %" value={selectedElement.x} minimum={0} maximum={100 - selectedElement.width} onChange={(x) => updateSelectedElement({ x })} />
                                        <NumberControl label="Y position %" value={selectedElement.y} minimum={0} maximum={100 - selectedElement.height} onChange={(y) => updateSelectedElement({ y })} />
                                        <NumberControl label="Width %" value={selectedElement.width} minimum={1} maximum={100 - selectedElement.x} onChange={(width) => updateSelectedElement({ width })} />
                                        <NumberControl label="Height %" value={selectedElement.height} minimum={1} maximum={100 - selectedElement.y} onChange={(height) => updateSelectedElement({ height })} />
                                        <NumberControl label="Layer order" value={selectedElement.zIndex} minimum={0} maximum={1000} step={1} onChange={(zIndex) => updateSelectedElement({ zIndex: Math.round(zIndex) })} />
                                    </div>
                                </div>
                            ) : (
                                <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">Select an element on the certificate to edit it.</p>
                            )}
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}

function NumberControl({
    label,
    value,
    minimum,
    maximum,
    step = 0.5,
    onChange,
}: {
    label: string;
    value: number;
    minimum: number;
    maximum: number;
    step?: number;
    onChange: (value: number) => void;
}) {
    return (
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {label}
            <input
                type="number"
                value={Number(value.toFixed(2))}
                min={minimum}
                max={maximum}
                step={step}
                onChange={(event) => onChange(clamp(Number(event.target.value), minimum, maximum))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
        </label>
    );
}
