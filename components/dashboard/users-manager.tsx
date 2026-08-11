"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import {
    Award,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    Download,
    ListChecks,
    LoaderCircle,
    Pencil,
    PlusCircle,
    QrCode,
    Search,
    Trash2,
    UserPlus,
    UsersRound,
    X,
} from "lucide-react";
import { CertificateGenerationModal } from "@/components/dashboard/certificate-generation-modal";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";
import {
    type UserCreateInput,
    type UserRecord,
    type UserRole,
    type UserUpdateInput,
    userDisplayName,
} from "@/lib/users";

const PAGE_SIZE = 20;

const dateFormatter = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

type UserFormValues = {
    email: string;
    password: string;
    username: string;
    firstname: string;
    lastname: string;
    middlename: string;
    ext: string;
    phone: string;
    role: UserRole;
};

type UserEditFormValues = Omit<UserFormValues, "password">;

const emptyUserForm: UserFormValues = {
    email: "",
    password: "",
    username: "",
    firstname: "",
    lastname: "",
    middlename: "",
    ext: "",
    phone: "",
    role: 1,
};

const emptyUserEditForm: UserEditFormValues = {
    email: "",
    username: "",
    firstname: "",
    lastname: "",
    middlename: "",
    ext: "",
    phone: "",
    role: 1,
};

function isActive(user: UserRecord) {
    return user.is_active === true || user.is_active === 1;
}

function roleDetails(role: number) {
    if (role === 2) {
        return {
            label: "Admin",
            classes: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
        };
    }
    if (role === 1) {
        return {
            label: "Attendee",
            classes: "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
        };
    }
    return {
        label: `Legacy role ${role}`,
        classes: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
    };
}

function isValidUserQrValue(value: string | null) {
    const qrValue = value?.trim() || "";
    return Boolean(qrValue) && new TextEncoder().encode(qrValue).length <= 2953;
}

function drawRoundedRectangle(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
) {
    const corner = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + corner, y);
    context.lineTo(x + width - corner, y);
    context.quadraticCurveTo(x + width, y, x + width, y + corner);
    context.lineTo(x + width, y + height - corner);
    context.quadraticCurveTo(x + width, y + height, x + width - corner, y + height);
    context.lineTo(x + corner, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - corner);
    context.lineTo(x, y + corner);
    context.quadraticCurveTo(x, y, x + corner, y);
    context.closePath();
}

function fitCanvasText(context: CanvasRenderingContext2D, text: string, maximumWidth: number) {
    if (context.measureText(text).width <= maximumWidth) return text;

    let fitted = text;
    while (fitted.length > 1 && context.measureText(`${fitted}…`).width > maximumWidth) {
        fitted = fitted.slice(0, -1);
    }
    return `${fitted.trimEnd()}…`;
}

function wrapCanvasText(
    context: CanvasRenderingContext2D,
    text: string,
    maximumWidth: number,
    maximumLines: number,
) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
        const candidate = currentLine ? `${currentLine} ${word}` : word;
        if (!currentLine || context.measureText(candidate).width <= maximumWidth) {
            currentLine = candidate;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    if (currentLine) lines.push(currentLine);
    if (lines.length <= maximumLines) return lines;

    const visible = lines.slice(0, Math.max(0, maximumLines - 1));
    visible.push(fitCanvasText(context, lines.slice(maximumLines - 1).join(" "), maximumWidth));
    return visible;
}

function safeQrFilename(value: string) {
    return value
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase()
        .slice(0, 80) || "user";
}

function UserQrImage({ user }: { user: UserRecord }) {
    const qrValue = user.user_qr_code?.trim() || "";
    const tooLong = Boolean(qrValue) && !isValidUserQrValue(qrValue);

    if (!qrValue || tooLong) {
        return (
            <div className="flex aspect-square w-full max-w-[260px] flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-slate-400 dark:border-slate-700 dark:bg-slate-950/70">
                <QrCode size={40} />
                <p className="mt-3 text-sm font-medium">{tooLong ? "The stored value is too long to encode." : "No user_qr_code is saved for this user."}</p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-[290px] rounded-[26px] bg-white p-5 shadow-xl shadow-blue-950/10 ring-1 ring-slate-200">
            <QRCode
                value={qrValue}
                title={`${userDisplayName(user)} QR code`}
                level="L"
                size={260}
                bgColor="#FFFFFF"
                fgColor="#0B2E5D"
                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                viewBox="0 0 260 260"
            />
        </div>
    );
}

export function UsersManager() {
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [userForm, setUserForm] = useState<UserFormValues>(emptyUserForm);
    const [isSavingUser, setIsSavingUser] = useState(false);
    const [editUser, setEditUser] = useState<UserRecord | null>(null);
    const [editUserForm, setEditUserForm] = useState<UserEditFormValues>(emptyUserEditForm);
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [deleteUser, setDeleteUser] = useState<UserRecord | null>(null);
    const [isDeletingUser, setIsDeletingUser] = useState(false);
    const [qrUser, setQrUser] = useState<UserRecord | null>(null);
    const [certificateUser, setCertificateUser] = useState<UserRecord | null>(null);
    const [isDownloadingQr, setIsDownloadingQr] = useState(false);
    const [qrDownloadError, setQrDownloadError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [modalError, setModalError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const qrImageRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let active = true;

        authenticatedFetch<{ users: UserRecord[] }>("/api/users")
            .then((response) => {
                if (active) setUsers(response.users);
            })
            .catch((loadError: unknown) => {
                if (active) {
                    setError(loadError instanceof Error ? loadError.message : "Unable to load users.");
                }
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!isAddModalOpen && !editUser && !deleteUser && !qrUser) return;

        function closeOnEscape(keyboardEvent: KeyboardEvent) {
            if (keyboardEvent.key !== "Escape" || isSavingUser || isSavingEdit || isDeletingUser || isDownloadingQr) return;
            if (qrUser) {
                setQrUser(null);
                return;
            }
            setIsAddModalOpen(false);
            setEditUser(null);
            setDeleteUser(null);
        }

        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [isAddModalOpen, editUser, deleteUser, qrUser, isSavingUser, isSavingEdit, isDeletingUser, isDownloadingQr]);

    function updateUserForm<Key extends keyof UserFormValues>(key: Key, value: UserFormValues[Key]) {
        setUserForm((current) => ({ ...current, [key]: value }));
    }

    function updateEditUserForm<Key extends keyof UserEditFormValues>(
        key: Key,
        value: UserEditFormValues[Key],
    ) {
        setEditUserForm((current) => ({ ...current, [key]: value }));
    }

    function openAddUser() {
        setUserForm(emptyUserForm);
        setModalError(null);
        setNotice(null);
        setIsAddModalOpen(true);
    }

    function openUserEditor(user: UserRecord) {
        setEditUserForm({
            email: user.email,
            username: user.username || "",
            firstname: user.firstname || "",
            lastname: user.lastname || "",
            middlename: user.middlename || "",
            ext: user.ext || "",
            phone: user.phone || "",
            role: user.role === 2 ? 2 : 1,
        });
        setModalError(null);
        setNotice(null);
        setEditUser(user);
    }

    function openDeleteUser(user: UserRecord) {
        setModalError(null);
        setNotice(null);
        setDeleteUser(user);
    }

    function openUserQrCode(user: UserRecord) {
        setQrDownloadError(null);
        setNotice(null);
        setQrUser(user);
    }

    async function createUser(submitEvent: React.FormEvent<HTMLFormElement>) {
        submitEvent.preventDefault();
        setModalError(null);

        if (userForm.password.length < 8) {
            setModalError("Password must contain at least 8 characters.");
            return;
        }

        const nullable = (value: string) => value.trim() || null;
        const input: UserCreateInput = {
            email: userForm.email.trim().toLowerCase(),
            password: userForm.password,
            username: nullable(userForm.username),
            firstname: nullable(userForm.firstname),
            lastname: nullable(userForm.lastname),
            middlename: nullable(userForm.middlename),
            ext: nullable(userForm.ext),
            phone: nullable(userForm.phone),
            role: userForm.role,
        };

        setIsSavingUser(true);
        try {
            const { user } = await authenticatedFetch<{ user: UserRecord }>("/api/users", {
                method: "POST",
                body: JSON.stringify(input),
            });
            setUsers((current) => [user, ...current]);
            setPage(1);
            setNotice(`${userDisplayName(user)} was created and their email was verified automatically.`);
            setIsAddModalOpen(false);
        } catch (saveError) {
            setModalError(saveError instanceof Error ? saveError.message : "Unable to create the user.");
        } finally {
            setIsSavingUser(false);
        }
    }

    async function updateUser(submitEvent: React.FormEvent<HTMLFormElement>) {
        submitEvent.preventDefault();
        if (!editUser) return;

        setModalError(null);
        const nullable = (value: string) => value.trim() || null;
        const input: UserUpdateInput = {
            email: editUserForm.email.trim().toLowerCase(),
            username: nullable(editUserForm.username),
            firstname: nullable(editUserForm.firstname),
            lastname: nullable(editUserForm.lastname),
            middlename: nullable(editUserForm.middlename),
            ext: nullable(editUserForm.ext),
            phone: nullable(editUserForm.phone),
            role: editUserForm.role,
        };

        setIsSavingEdit(true);
        try {
            const { user } = await authenticatedFetch<{ user: UserRecord }>(
                `/api/users/${editUser.id}`,
                {
                    method: "PATCH",
                    body: JSON.stringify(input),
                },
            );
            setUsers((current) => current.map((item) => (item.id === user.id ? user : item)));
            setNotice(`${userDisplayName(user)} was updated.`);
            setEditUser(null);
        } catch (saveError) {
            setModalError(saveError instanceof Error ? saveError.message : "Unable to update the user.");
        } finally {
            setIsSavingEdit(false);
        }
    }

    async function confirmDeleteUser() {
        if (!deleteUser) return;

        const userToDelete = deleteUser;
        setModalError(null);
        setIsDeletingUser(true);
        try {
            const result = await authenticatedFetch<{
                authUserDeleted: boolean;
                deletedRelatedRecords: Record<string, number>;
            }>(
                `/api/users/${userToDelete.id}`,
                { method: "DELETE" },
            );
            setUsers((current) => current.filter((user) => user.id !== userToDelete.id));
            const relatedRecordCount = Object.values(result.deletedRelatedRecords).reduce(
                (total, count) => total + count,
                0,
            );
            setNotice(
                result.authUserDeleted
                    ? `${userDisplayName(userToDelete)}, their Authentication credentials, and ${relatedRecordCount} related record(s) were deleted.`
                    : `${userDisplayName(userToDelete)} and ${relatedRecordCount} related record(s) were deleted. No matching Supabase Authentication account existed for ${userToDelete.email}.`,
            );
            setDeleteUser(null);
        } catch (deleteError) {
            setModalError(deleteError instanceof Error ? deleteError.message : "Unable to delete the user.");
        } finally {
            setIsDeletingUser(false);
        }
    }

    function downloadUserQrCard() {
        if (!qrUser || !isValidUserQrValue(qrUser.user_qr_code)) {
            setQrDownloadError("This user does not have a valid user_qr_code to download.");
            return;
        }

        const user = qrUser;
        const qrSvg = qrImageRef.current?.querySelector("svg");
        if (!qrSvg) {
            setQrDownloadError("The QR code image is not ready yet.");
            return;
        }

        setIsDownloadingQr(true);
        setQrDownloadError(null);

        const svgCopy = qrSvg.cloneNode(true) as SVGSVGElement;
        svgCopy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        const svgBlob = new Blob([new XMLSerializer().serializeToString(svgCopy)], {
            type: "image/svg+xml;charset=utf-8",
        });
        const svgUrl = URL.createObjectURL(svgBlob);
        const qrImage = new window.Image();

        qrImage.onload = () => {
            URL.revokeObjectURL(svgUrl);

            try {
                const outputWidth = 1200;
                const outputHeight = 1600;
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d");
                if (!context) throw new Error("Canvas is unavailable.");

                canvas.width = outputWidth;
                canvas.height = outputHeight;

                const background = context.createLinearGradient(0, 0, outputWidth, outputHeight);
                background.addColorStop(0, "#F8FBFF");
                background.addColorStop(0.55, "#FFFFFF");
                background.addColorStop(1, "#FFF9EC");
                context.fillStyle = background;
                context.fillRect(0, 0, outputWidth, outputHeight);

                context.fillStyle = "#0B2E5D";
                context.fillRect(0, 0, outputWidth, 390);
                const headerGradient = context.createLinearGradient(0, 0, outputWidth, 390);
                headerGradient.addColorStop(0, "rgba(14, 116, 180, 0.82)");
                headerGradient.addColorStop(0.65, "rgba(11, 46, 93, 0)");
                context.fillStyle = headerGradient;
                context.fillRect(0, 0, outputWidth, 390);

                context.fillStyle = "#D5A83D";
                context.fillRect(0, 382, outputWidth, 8);
                context.fillStyle = "rgba(213, 168, 61, 0.14)";
                context.beginPath();
                context.arc(1110, 80, 250, 0, Math.PI * 2);
                context.fill();
                context.strokeStyle = "rgba(255, 255, 255, 0.12)";
                context.lineWidth = 3;
                context.beginPath();
                context.arc(1100, 70, 175, 0, Math.PI * 2);
                context.stroke();

                context.beginPath();
                context.arc(112, 105, 58, 0, Math.PI * 2);
                context.fillStyle = "#FFFFFF";
                context.fill();
                context.lineWidth = 6;
                context.strokeStyle = "#D5A83D";
                context.stroke();
                context.fillStyle = "#0B2E5D";
                context.font = "800 31px Arial, sans-serif";
                context.textAlign = "center";
                context.fillText("NU", 112, 116);

                context.textAlign = "left";
                context.fillStyle = "#FFFFFF";
                context.font = "700 28px Arial, sans-serif";
                context.fillText("NATIONAL UNIVERSITY", 198, 96);
                context.fillStyle = "#BAE6FD";
                context.font = "600 18px Arial, sans-serif";
                context.fillText("QUALITY MANAGEMENT OFFICE · MANILA", 198, 128);

                context.fillStyle = "#FDE68A";
                context.font = "700 18px Arial, sans-serif";
                context.fillText("OFFICIAL DIGITAL ACCESS CARD", 72, 210);
                context.fillStyle = "#FFFFFF";
                context.font = "700 54px Arial, sans-serif";
                const nameLines = wrapCanvasText(context, userDisplayName(user), 970, 2);
                nameLines.forEach((line, index) => context.fillText(line, 72, 270 + index * 62));

                const panelX = 100;
                const panelY = 455;
                const panelWidth = 1000;
                const panelHeight = 950;
                context.save();
                context.shadowColor = "rgba(15, 46, 82, 0.16)";
                context.shadowBlur = 48;
                context.shadowOffsetY = 22;
                drawRoundedRectangle(context, panelX, panelY, panelWidth, panelHeight, 56);
                context.fillStyle = "#FFFFFF";
                context.fill();
                context.restore();

                drawRoundedRectangle(context, 438, 505, 324, 48, 24);
                context.fillStyle = "#E8F3FC";
                context.fill();
                context.fillStyle = "#0E6FAE";
                context.font = "700 19px Arial, sans-serif";
                context.textAlign = "center";
                context.fillText("SCAN TO VERIFY IDENTITY", 600, 537);

                const qrSize = 650;
                const qrX = (outputWidth - qrSize) / 2;
                const qrY = 590;
                context.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

                context.fillStyle = "#0B2E5D";
                context.font = "700 31px Arial, sans-serif";
                context.fillText(roleDetails(user.role).label.toUpperCase(), 600, 1300);
                context.fillStyle = "#64748B";
                context.font = "500 23px Arial, sans-serif";
                context.fillText(fitCanvasText(context, user.email, 830), 600, 1340);

                context.strokeStyle = "#E2E8F0";
                context.lineWidth = 2;
                context.beginPath();
                context.moveTo(155, 1455);
                context.lineTo(1045, 1455);
                context.stroke();

                context.textAlign = "left";
                context.fillStyle = "#0B2E5D";
                context.font = "700 20px Arial, sans-serif";
                context.fillText(`USER ID  ·  ${String(user.id).padStart(6, "0")}`, 100, 1520);
                context.fillStyle = "#94A3B8";
                context.font = "500 18px Arial, sans-serif";
                context.fillText("Personal credential · Do not share", 100, 1554);
                context.textAlign = "right";
                context.fillStyle = "#D5A83D";
                context.font = "700 20px Arial, sans-serif";
                context.fillText("NU QMO MANILA", 1100, 1520);
                context.fillStyle = "#64748B";
                context.font = "500 18px Arial, sans-serif";
                context.fillText("QUALITY • INTEGRITY • EXCELLENCE", 1100, 1554);

                canvas.toBlob((pngBlob) => {
                    if (!pngBlob) {
                        setQrDownloadError("Unable to create the QR card image.");
                        setIsDownloadingQr(false);
                        return;
                    }

                    const pngUrl = URL.createObjectURL(pngBlob);
                    const link = document.createElement("a");
                    link.href = pngUrl;
                    link.download = `${safeQrFilename(userDisplayName(user))}-nu-qmo-qr-card.png`;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
                    setIsDownloadingQr(false);
                }, "image/png");
            } catch {
                setQrDownloadError("Unable to create the QR card image.");
                setIsDownloadingQr(false);
            }
        };

        qrImage.onerror = () => {
            URL.revokeObjectURL(svgUrl);
            setQrDownloadError("Unable to prepare the QR code image.");
            setIsDownloadingQr(false);
        };
        qrImage.src = svgUrl;
    }

    const normalizedQuery = query.trim().toLowerCase();
    const filteredUsers = normalizedQuery
        ? users.filter((user) =>
            [userDisplayName(user), user.email, user.username, user.phone]
                .filter(Boolean)
                .some((value) => value?.toLowerCase().includes(normalizedQuery)),
        )
        : users;
    const pageCount = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount);
    const visibleUsers = filteredUsers.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE,
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-sm font-medium uppercase tracking-[0.3em] text-sky-700 dark:text-sky-300">People</p>
                    <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Users Directory</h1>
                    <p className="mt-2 text-slate-600 dark:text-slate-400">View Supabase user profiles and the events they attended.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300">
                        <UsersRound size={16} /> {users.length} users
                    </div>
                    <button
                        type="button"
                        onClick={openAddUser}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 py-3 font-semibold text-white transition hover:bg-sky-500"
                    >
                        <UserPlus size={17} /> Add user
                    </button>
                </div>
            </div>

            {notice ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
                    {notice}
                </div>
            ) : null}

            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                    <Search size={16} />
                    <span className="sr-only">Search users</span>
                    <input
                        value={query}
                        onChange={(inputEvent) => {
                            setQuery(inputEvent.target.value);
                            setPage(1);
                        }}
                        className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-600"
                        placeholder="Search by name, email, username, or phone"
                    />
                </label>
            </div>

            {error ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300">
                    <span className="flex items-center gap-2"><CircleAlert size={16} /> {error}</span>
                    <Link href="/" className="font-semibold underline underline-offset-4">Sign in</Link>
                </div>
            ) : null}

            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white/85 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1120px] border-collapse text-left">
                        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-400">
                            <tr>
                                <th className="px-5 py-4 font-semibold">User</th>
                                <th className="px-5 py-4 font-semibold">Contact</th>
                                <th className="px-5 py-4 font-semibold">Role</th>
                                <th className="px-5 py-4 font-semibold">Status</th>
                                <th className="px-5 py-4 font-semibold">Created</th>
                                <th className="px-5 py-4 text-right font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={6} className="px-5 py-14 text-center text-slate-500 dark:text-slate-400">
                                        <span className="inline-flex items-center gap-2"><LoaderCircle size={18} className="animate-spin" /> Loading users…</span>
                                    </td>
                                </tr>
                            ) : visibleUsers.length ? visibleUsers.map((user) => (
                                <tr key={user.id} className="transition hover:bg-slate-50/80 dark:hover:bg-white/[0.03]">
                                    <td className="px-5 py-4">
                                        <p className="font-semibold text-slate-900 dark:text-white">{userDisplayName(user)}</p>
                                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{user.username ? `@${user.username}` : `User #${user.id}`}</p>
                                    </td>
                                    <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">
                                        <p>{user.email}</p>
                                        <p className="mt-1 text-slate-400">{user.phone || "No phone"}</p>
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${roleDetails(user.role).classes}`}>
                                            {roleDetails(user.role).label} · {user.role}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isActive(user) ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}>
                                            {isActive(user) ? "Active" : user.is_active === null ? "Not set" : "Inactive"}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-sm text-slate-500 dark:text-slate-400">
                                        {user.created_at ? dateFormatter.format(new Date(user.created_at)) : "Unknown"}
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => openUserQrCode(user)}
                                                aria-label={`View QR code for ${userDisplayName(user)}`}
                                                className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 transition hover:border-sky-400 hover:bg-sky-100 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-300 dark:hover:bg-sky-400/20"
                                            >
                                                <QrCode size={16} /> QR card
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => openUserEditor(user)}
                                                aria-label={`Edit ${userDisplayName(user)}`}
                                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-violet-500 dark:hover:bg-violet-400/10 dark:hover:text-violet-300"
                                            >
                                                <Pencil size={15} /> Edit
                                            </button>
                                            <Link
                                                href={`/dashboard/users/${user.id}/attendance`}
                                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-amber-500 dark:hover:bg-amber-400/10 dark:hover:text-amber-300"
                                            >
                                                <ListChecks size={16} /> Attendance
                                            </Link>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setNotice(null);
                                                    setCertificateUser(user);
                                                }}
                                                aria-label={`Generate certificate for ${userDisplayName(user)}`}
                                                className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 transition hover:border-amber-400 hover:bg-amber-100 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300 dark:hover:bg-amber-400/20"
                                            >
                                                <Award size={16} /> Certificate
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => openDeleteUser(user)}
                                                aria-label={`Delete ${userDisplayName(user)}`}
                                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-rose-500 dark:hover:bg-rose-400/10 dark:hover:text-rose-300"
                                            >
                                                <Trash2 size={15} /> Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={6} className="px-5 py-14 text-center">
                                        <p className="font-semibold text-slate-900 dark:text-white">No users found</p>
                                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Try a different search term.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {!isLoading && filteredUsers.length ? (
                    <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        <span>Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length}</span>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setPage((current) => Math.max(1, current - 1))}
                                disabled={currentPage === 1}
                                aria-label="Previous user page"
                                className="rounded-xl border border-slate-200 p-2 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-white/5"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                                disabled={currentPage === pageCount}
                                aria-label="Next user page"
                                className="rounded-xl border border-slate-200 p-2 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-white/5"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>

            {qrUser ? (
                <div
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget && !isDownloadingQr) setQrUser(null);
                    }}
                >
                    <div role="dialog" aria-modal="true" aria-labelledby="user-qr-title" className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-[30px] border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-7">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700 dark:text-sky-300">Official user QR card</p>
                                <h2 id="user-qr-title" className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{userDisplayName(qrUser)}</h2>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Generated from nu_users.user_qr_code</p>
                            </div>
                            <button type="button" onClick={() => setQrUser(null)} disabled={isDownloadingQr} aria-label="Close user QR card" className="rounded-xl border border-slate-200 p-2.5 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-white/5"><X size={18} /></button>
                        </div>

                        <div className="mt-6 overflow-hidden rounded-[30px] border border-slate-200 bg-gradient-to-br from-sky-50 via-white to-amber-50 shadow-xl shadow-blue-950/10 dark:border-slate-700">
                            <div className="relative overflow-hidden bg-gradient-to-br from-sky-700 to-blue-950 px-6 pb-8 pt-6 text-left text-white">
                                <div className="absolute -right-14 -top-20 h-52 w-52 rounded-full border border-white/10 bg-amber-300/10" />
                                <div className="relative flex items-center gap-3">
                                    <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-amber-400 bg-white text-sm font-black text-blue-950 shadow-lg">NU</span>
                                    <span>
                                        <span className="block text-sm font-bold tracking-wide">NATIONAL UNIVERSITY</span>
                                        <span className="mt-0.5 block text-[10px] font-semibold tracking-[0.14em] text-sky-200">QUALITY MANAGEMENT OFFICE · MANILA</span>
                                    </span>
                                </div>
                                <p className="relative mt-7 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300">Official digital access card</p>
                                <p className="relative mt-2 text-2xl font-bold leading-tight">{userDisplayName(qrUser)}</p>
                            </div>

                            <div className="px-6 pb-6 pt-7 text-center">
                                <div ref={qrImageRef} className="flex justify-center">
                                    <UserQrImage user={qrUser} />
                                </div>
                                <span className="mt-5 inline-flex rounded-full bg-sky-100 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-sky-800 dark:bg-sky-400/15 dark:text-sky-200">{roleDetails(qrUser.role).label}</span>
                                <p className="mt-3 break-all text-sm font-medium text-slate-600 dark:text-slate-300">{qrUser.email}</p>
                                <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-200 pt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:border-slate-700">
                                    <span>User ID · {String(qrUser.id).padStart(6, "0")}</span>
                                    <span className="text-amber-600 dark:text-amber-300">NU QMO Manila</span>
                                </div>
                            </div>
                        </div>

                        {!qrUser.user_qr_code?.trim() ? (
                            <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">No QR value is saved for this profile. Add a value to <span className="font-semibold">nu_users.user_qr_code</span> in Supabase before downloading.</p>
                        ) : null}
                        {qrDownloadError ? (
                            <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300">{qrDownloadError}</p>
                        ) : null}

                        <div className="mt-6 grid gap-3 sm:grid-cols-2">
                            <button type="button" onClick={downloadUserQrCard} disabled={!isValidUserQrValue(qrUser.user_qr_code) || isDownloadingQr} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-700 px-5 py-3 font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50">
                                {isDownloadingQr ? <LoaderCircle size={17} className="animate-spin" /> : <Download size={17} />}
                                {isDownloadingQr ? "Preparing PNG…" : "Download high-resolution PNG"}
                            </button>
                            <button type="button" onClick={() => setQrUser(null)} disabled={isDownloadingQr} className="rounded-2xl border border-slate-200 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">Close</button>
                        </div>
                    </div>
                </div>
            ) : null}

            {isAddModalOpen ? (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
                    onMouseDown={(mouseEvent) => {
                        if (mouseEvent.target === mouseEvent.currentTarget && !isSavingUser) {
                            setIsAddModalOpen(false);
                        }
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="add-user-title"
                        className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-8"
                    >
                        <div className="mb-6 flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-700 dark:text-sky-300">Supabase Authentication</p>
                                <h2 id="add-user-title" className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">Add a user</h2>
                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">The email will be confirmed automatically and linked to a new nu_users profile.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsAddModalOpen(false)}
                                disabled={isSavingUser}
                                aria-label="Close add user dialog"
                                className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-white/5"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={createUser} className="space-y-5">
                            {modalError ? (
                                <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300">
                                    <CircleAlert size={16} /> {modalError}
                                </div>
                            ) : null}

                            <div className="grid gap-4 sm:grid-cols-2">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Email</span>
                                    <input
                                        autoFocus
                                        required
                                        type="email"
                                        autoComplete="off"
                                        value={userForm.email}
                                        onChange={(event) => updateUserForm("email", event.target.value)}
                                        placeholder="attendee@example.com"
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                    />
                                </label>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Initial password</span>
                                    <input
                                        required
                                        type="password"
                                        minLength={8}
                                        maxLength={128}
                                        autoComplete="new-password"
                                        value={userForm.password}
                                        onChange={(event) => updateUserForm("password", event.target.value)}
                                        placeholder="At least 8 characters"
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                    />
                                </label>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">First name</span>
                                    <input value={userForm.firstname} onChange={(event) => updateUserForm("firstname", event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                                </label>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Last name</span>
                                    <input value={userForm.lastname} onChange={(event) => updateUserForm("lastname", event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                                </label>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Middle name</span>
                                    <input value={userForm.middlename} onChange={(event) => updateUserForm("middlename", event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                                </label>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Name extension</span>
                                    <input value={userForm.ext} onChange={(event) => updateUserForm("ext", event.target.value)} placeholder="Jr., III…" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                                </label>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Username</span>
                                    <input value={userForm.username} onChange={(event) => updateUserForm("username", event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                                </label>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Phone</span>
                                    <input type="tel" value={userForm.phone} onChange={(event) => updateUserForm("phone", event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                                </label>
                            </div>

                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                <span className="mb-2 block">Role</span>
                                <select
                                    value={userForm.role}
                                    onChange={(event) => updateUserForm("role", Number(event.target.value) as UserRole)}
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                >
                                    <option value={1}>1 — Attendee</option>
                                    <option value={2}>2 — Admin</option>
                                </select>
                            </label>

                            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                                <button type="button" onClick={() => setIsAddModalOpen(false)} disabled={isSavingUser} className="rounded-2xl border border-slate-200 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
                                <button type="submit" disabled={isSavingUser} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60">
                                    {isSavingUser ? <LoaderCircle size={17} className="animate-spin" /> : <PlusCircle size={17} />}
                                    {isSavingUser ? "Creating…" : "Create verified user"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            {editUser ? (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
                    onMouseDown={(mouseEvent) => {
                        if (mouseEvent.target === mouseEvent.currentTarget && !isSavingEdit) setEditUser(null);
                    }}
                >
                    <div role="dialog" aria-modal="true" aria-labelledby="edit-user-title" className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-8">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-violet-600 dark:text-violet-300"><Pencil size={16} /> User profile</p>
                                <h2 id="edit-user-title" className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Edit user</h2>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{userDisplayName(editUser)}</p>
                            </div>
                            <button type="button" onClick={() => setEditUser(null)} disabled={isSavingEdit} aria-label="Close user editor" className="rounded-xl border border-slate-200 p-2 text-slate-500 dark:border-slate-700 dark:text-slate-400"><X size={18} /></button>
                        </div>

                        <form onSubmit={updateUser} className="mt-6 space-y-5">
                            {modalError ? (
                                <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300"><CircleAlert size={16} /> {modalError}</div>
                            ) : null}

                            <div className="grid gap-4 sm:grid-cols-2">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Email</span>
                                    <input autoFocus required type="email" value={editUserForm.email} onChange={(event) => updateEditUserForm("email", event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                                </label>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Username</span>
                                    <input value={editUserForm.username} onChange={(event) => updateEditUserForm("username", event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                                </label>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">First name</span>
                                    <input value={editUserForm.firstname} onChange={(event) => updateEditUserForm("firstname", event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                                </label>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Last name</span>
                                    <input value={editUserForm.lastname} onChange={(event) => updateEditUserForm("lastname", event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                                </label>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Middle name</span>
                                    <input value={editUserForm.middlename} onChange={(event) => updateEditUserForm("middlename", event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                                </label>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Name extension</span>
                                    <input value={editUserForm.ext} onChange={(event) => updateEditUserForm("ext", event.target.value)} placeholder="Jr., III…" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                                </label>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Phone</span>
                                    <input type="tel" value={editUserForm.phone} onChange={(event) => updateEditUserForm("phone", event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                                </label>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="mb-2 block">Role</span>
                                    <select value={editUserForm.role} onChange={(event) => updateEditUserForm("role", Number(event.target.value) as UserRole)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                                        <option value={1}>1 — Attendee</option>
                                        <option value={2}>2 — Admin</option>
                                    </select>
                                </label>
                            </div>

                            <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-950/70 dark:text-slate-400">Profile changes are saved to nu_users. Email, role, and identity metadata are also synchronized to the linked Supabase Authentication account.</p>
                            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                <button type="button" onClick={() => setEditUser(null)} disabled={isSavingEdit} className="rounded-2xl border border-slate-200 px-5 py-3 font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300">Cancel</button>
                                <button type="submit" disabled={isSavingEdit} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60">
                                    {isSavingEdit ? <LoaderCircle size={17} className="animate-spin" /> : <Pencil size={17} />}
                                    {isSavingEdit ? "Saving…" : "Save changes"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            {deleteUser ? (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
                    onMouseDown={(mouseEvent) => {
                        if (mouseEvent.target === mouseEvent.currentTarget && !isDeletingUser) setDeleteUser(null);
                    }}
                >
                    <div role="alertdialog" aria-modal="true" aria-labelledby="delete-user-title" aria-describedby="delete-user-description" className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-8">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-rose-600 dark:text-rose-300"><Trash2 size={16} /> Permanent action</p>
                                <h2 id="delete-user-title" className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Delete user?</h2>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{userDisplayName(deleteUser)}</p>
                            </div>
                            <button type="button" onClick={() => setDeleteUser(null)} disabled={isDeletingUser} aria-label="Close delete user dialog" className="rounded-xl border border-slate-200 p-2 text-slate-500 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400"><X size={18} /></button>
                        </div>

                        {modalError ? (
                            <div className="mt-5 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300"><CircleAlert size={16} /> {modalError}</div>
                        ) : null}

                        <p id="delete-user-description" className="mt-5 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-400/10 dark:text-rose-200">
                            This permanently removes the <span className="font-semibold">nu_users</span> profile, Supabase Authentication credentials, attendance, attendance logs, questions, and event notes matching <span className="font-semibold">{deleteUser.email}</span>. They will no longer be able to sign in.
                        </p>
                        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button type="button" onClick={() => setDeleteUser(null)} disabled={isDeletingUser} className="rounded-2xl border border-slate-200 px-5 py-3 font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300">Cancel</button>
                            <button type="button" onClick={confirmDeleteUser} disabled={isDeletingUser} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 font-semibold text-white transition hover:bg-rose-500 disabled:opacity-60">
                                {isDeletingUser ? <LoaderCircle size={17} className="animate-spin" /> : <Trash2 size={17} />}
                                {isDeletingUser ? "Deleting…" : "Delete user"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {certificateUser ? (
                <CertificateGenerationModal
                    target={{ kind: "user", user: certificateUser }}
                    onClose={() => setCertificateUser(null)}
                    onCompleted={(message) => setNotice(message)}
                />
            ) : null}
        </div>
    );
}
