"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
    Building2,
    CircleAlert,
    Layers3,
    LoaderCircle,
    MapPin,
    Pencil,
    PlusCircle,
    Search,
    Trash2,
    TriangleAlert,
    UsersRound,
    Warehouse,
    X,
} from "lucide-react";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";
import type {
    BuildingRecord,
    DepartmentRecord,
    FacilityData,
    FacilityRecord,
    FacilityResource,
    FloorRecord,
    PlaceRecord,
    RoomRecord,
} from "@/lib/facilities";

type FacilityForm = {
    name: string;
    address: string;
    building_id: string;
    floor_id: string;
    room_id: string;
    department_id: string;
    capacity: string;
    direction: string;
};

const emptyData: FacilityData = {
    buildings: [],
    departments: [],
    floors: [],
    rooms: [],
    places: [],
};

const emptyForm: FacilityForm = {
    name: "",
    address: "",
    building_id: "",
    floor_id: "",
    room_id: "",
    department_id: "",
    capacity: "",
    direction: "",
};

const resourceDetails = {
    buildings: { label: "Buildings", singular: "building", icon: Building2 },
    floors: { label: "Floors", singular: "floor", icon: Layers3 },
    rooms: { label: "Rooms", singular: "room", icon: Warehouse },
    places: { label: "Places", singular: "place", icon: MapPin },
    departments: { label: "Departments", singular: "department", icon: UsersRound },
} satisfies Record<FacilityResource, { label: string; singular: string; icon: typeof Building2 }>;

const resourceOrder: FacilityResource[] = ["buildings", "floors", "rooms", "places", "departments"];

function recordName(resource: FacilityResource, record: FacilityRecord) {
    switch (resource) {
        case "buildings":
            return (record as BuildingRecord).building_name;
        case "departments":
            return (record as DepartmentRecord).department_name;
        case "floors":
            return (record as FloorRecord).floor_name;
        case "rooms":
            return (record as RoomRecord).room_no;
        case "places":
            return (record as PlaceRecord).place_name;
    }
}

export function FacilitiesManager() {
    const [data, setData] = useState<FacilityData>(emptyData);
    const [activeResource, setActiveResource] = useState<FacilityResource>("buildings");
    const [query, setQuery] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState<FacilityRecord | null>(null);
    const [form, setForm] = useState<FacilityForm>(emptyForm);
    const [isSaving, setIsSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [modalError, setModalError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        authenticatedFetch<FacilityData>("/api/facilities")
            .then((response) => {
                if (active) setData(response);
            })
            .catch((loadError: unknown) => {
                if (active) {
                    setError(loadError instanceof Error ? loadError.message : "Unable to load facilities.");
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
        if (!isModalOpen) return;

        function closeOnEscape(keyboardEvent: KeyboardEvent) {
            if (keyboardEvent.key === "Escape" && !isSaving) setIsModalOpen(false);
        }

        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [isModalOpen, isSaving]);

    const floorsForBuilding = data.floors.filter(
        (floor) => String(floor.building_id) === form.building_id,
    );
    const activeRecords = data[activeResource] as FacilityRecord[];
    const normalizedQuery = query.trim().toLowerCase();
    const filteredRecords = normalizedQuery
        ? activeRecords.filter((record) =>
            searchText(activeResource, record).toLowerCase().includes(normalizedQuery),
        )
        : activeRecords;
    const details = resourceDetails[activeResource];
    const relationshipIssueCount =
        data.floors.filter((floor) => !data.buildings.some((building) => building.id === floor.building_id)).length +
        data.rooms.filter((room) => {
            const floor = data.floors.find((candidate) => candidate.id === room.floor_id);
            return !floor || floor.building_id !== room.building_id;
        }).length +
        data.places.filter((place) =>
            !data.rooms.some((room) => room.id === place.room_id) ||
            (place.department_id !== null && !data.departments.some((department) => department.id === place.department_id)),
        ).length;

    function buildingName(id: number) {
        return data.buildings.find((building) => building.id === id)?.building_name || `Building ${id}`;
    }

    function floorName(id: number) {
        return data.floors.find((floor) => floor.id === id)?.floor_name || `Floor ${id}`;
    }

    function departmentName(id: number | null) {
        if (id === null) return "No department";
        return data.departments.find((department) => department.id === id)?.department_name || `Department ${id}`;
    }

    function roomLocation(roomId: number) {
        const room = data.rooms.find((candidate) => candidate.id === roomId);
        if (!room) return `Room ${roomId}`;
        return `${buildingName(room.building_id)} · ${floorName(room.floor_id)} · Room ${room.room_no}`;
    }

    function searchText(resource: FacilityResource, record: FacilityRecord) {
        if (resource === "buildings") {
            const building = record as BuildingRecord;
            return `${building.building_name} ${building.address || ""}`;
        }
        if (resource === "departments") return (record as DepartmentRecord).department_name;
        if (resource === "floors") {
            const floor = record as FloorRecord;
            return `${floor.floor_name} ${buildingName(floor.building_id)}`;
        }
        if (resource === "rooms") {
            const room = record as RoomRecord;
            return `${room.room_no} ${buildingName(room.building_id)} ${floorName(room.floor_id)}`;
        }
        const place = record as PlaceRecord;
        return `${place.place_name} ${roomLocation(place.room_id)} ${departmentName(place.department_id)} ${place.direction || ""}`;
    }

    function createDefaults(resource: FacilityResource) {
        const firstFloor = data.floors[0];
        const firstRoom = data.rooms[0];

        return {
            ...emptyForm,
            building_id:
                resource === "rooms" && firstFloor
                    ? String(firstFloor.building_id)
                    : data.buildings[0]
                        ? String(data.buildings[0].id)
                        : "",
            floor_id: resource === "rooms" && firstFloor ? String(firstFloor.id) : "",
            room_id: resource === "places" && firstRoom ? String(firstRoom.id) : "",
        };
    }

    function openCreateModal() {
        setEditingRecord(null);
        setForm(createDefaults(activeResource));
        setModalError(null);
        setNotice(null);
        setIsModalOpen(true);
    }

    function openEditModal(record: FacilityRecord) {
        setEditingRecord(record);
        setModalError(null);
        setNotice(null);

        if (activeResource === "buildings") {
            const building = record as BuildingRecord;
            setForm({ ...emptyForm, name: building.building_name, address: building.address || "" });
        } else if (activeResource === "departments") {
            setForm({ ...emptyForm, name: (record as DepartmentRecord).department_name });
        } else if (activeResource === "floors") {
            const floor = record as FloorRecord;
            setForm({ ...emptyForm, name: floor.floor_name, building_id: String(floor.building_id) });
        } else if (activeResource === "rooms") {
            const room = record as RoomRecord;
            setForm({
                ...emptyForm,
                name: room.room_no,
                building_id: String(room.building_id),
                floor_id: String(room.floor_id),
                capacity: room.room_max_capacity === null ? "" : String(room.room_max_capacity),
            });
        } else {
            const place = record as PlaceRecord;
            setForm({
                ...emptyForm,
                name: place.place_name,
                room_id: String(place.room_id),
                department_id: place.department_id === null ? "" : String(place.department_id),
                direction: place.direction || "",
            });
        }

        setIsModalOpen(true);
    }

    function closeModal() {
        if (!isSaving) setIsModalOpen(false);
    }

    function updateForm<Key extends keyof FacilityForm>(key: Key, value: FacilityForm[Key]) {
        setForm((current) => ({ ...current, [key]: value }));
    }

    function changeBuilding(buildingId: string) {
        const firstFloor = data.floors.find((floor) => String(floor.building_id) === buildingId);
        setForm((current) => ({
            ...current,
            building_id: buildingId,
            floor_id: firstFloor ? String(firstFloor.id) : "",
        }));
    }

    function requestPayload() {
        switch (activeResource) {
            case "buildings":
                return { building_name: form.name.trim(), address: form.address.trim() || null };
            case "departments":
                return { department_name: form.name.trim() };
            case "floors":
                return { floor_name: form.name.trim(), building_id: Number(form.building_id) };
            case "rooms":
                return {
                    room_no: form.name.trim(),
                    building_id: Number(form.building_id),
                    floor_id: Number(form.floor_id),
                    room_max_capacity: form.capacity === "" ? null : Number(form.capacity),
                };
            case "places":
                return {
                    place_name: form.name.trim(),
                    room_id: Number(form.room_id),
                    department_id: form.department_id === "" ? null : Number(form.department_id),
                    direction: form.direction.trim() || null,
                };
        }
    }

    function updateResourceData(
        resource: FacilityResource,
        updater: (records: FacilityRecord[]) => FacilityRecord[],
    ) {
        setData((current) => ({
            ...current,
            [resource]: updater(current[resource] as FacilityRecord[]),
        }) as FacilityData);
    }

    async function saveRecord(submitEvent: React.FormEvent<HTMLFormElement>) {
        submitEvent.preventDefault();
        setModalError(null);
        setIsSaving(true);

        try {
            const path = editingRecord
                ? `/api/facilities/${activeResource}/${editingRecord.id}`
                : `/api/facilities/${activeResource}`;
            const { record } = await authenticatedFetch<{ record: FacilityRecord }>(path, {
                method: editingRecord ? "PATCH" : "POST",
                body: JSON.stringify(requestPayload()),
            });

            updateResourceData(activeResource, (records) =>
                (editingRecord
                    ? records.map((item) => (item.id === record.id ? record : item))
                    : [...records, record]
                ).sort((left, right) => recordName(activeResource, left).localeCompare(recordName(activeResource, right))),
            );
            setNotice(editingRecord ? `${details.singular} updated successfully.` : `${details.singular} created successfully.`);
            setIsModalOpen(false);
        } catch (saveError) {
            setModalError(saveError instanceof Error ? saveError.message : `Unable to save the ${details.singular}.`);
        } finally {
            setIsSaving(false);
        }
    }

    async function deleteRecord(record: FacilityRecord) {
        const sideEffect = activeResource === "departments"
            ? " Place department assignments will be cleared."
            : activeResource === "places"
                ? " Event location links will be cleared."
                : " Related records must be deleted first.";
        const confirmed = window.confirm(`Delete “${recordName(activeResource, record)}”?${sideEffect}`);
        if (!confirmed) return;

        setDeletingId(record.id);
        setError(null);
        setNotice(null);

        try {
            await authenticatedFetch<{ record: FacilityRecord }>(
                `/api/facilities/${activeResource}/${record.id}`,
                { method: "DELETE" },
            );
            updateResourceData(activeResource, (records) => records.filter((item) => item.id !== record.id));
            setNotice(`${details.singular} deleted successfully.`);
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : `Unable to delete the ${details.singular}.`);
        } finally {
            setDeletingId(null);
        }
    }

    function relationship(record: FacilityRecord) {
        if (activeResource === "buildings") {
            const building = record as BuildingRecord;
            const floorCount = data.floors.filter((floor) => floor.building_id === building.id).length;
            const roomCount = data.rooms.filter((room) => room.building_id === building.id).length;
            return `${floorCount} floors · ${roomCount} rooms`;
        }
        if (activeResource === "departments") {
            const department = record as DepartmentRecord;
            return `${data.places.filter((place) => place.department_id === department.id).length} places`;
        }
        if (activeResource === "floors") {
            const floor = record as FloorRecord;
            return buildingName(floor.building_id);
        }
        if (activeResource === "rooms") {
            const room = record as RoomRecord;
            return `${buildingName(room.building_id)} · ${floorName(room.floor_id)}`;
        }
        return roomLocation((record as PlaceRecord).room_id);
    }

    function recordDetail(record: FacilityRecord) {
        if (activeResource === "buildings") return (record as BuildingRecord).address || "No address";
        if (activeResource === "departments") return "Department assignment";
        if (activeResource === "floors") {
            const floor = record as FloorRecord;
            return `${data.rooms.filter((room) => room.floor_id === floor.id).length} rooms`;
        }
        if (activeResource === "rooms") {
            const room = record as RoomRecord;
            const places = data.places.filter((place) => place.room_id === room.id).length;
            return `${room.room_max_capacity ? `${room.room_max_capacity} capacity` : "No capacity"} · ${places} places`;
        }
        const place = record as PlaceRecord;
        return `${departmentName(place.department_id)}${place.direction ? ` · ${place.direction}` : ""}`;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-sm font-medium uppercase tracking-[0.3em] text-sky-700 dark:text-sky-300">Location management</p>
                    <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Facilities</h1>
                    <p className="mt-2 text-slate-600 dark:text-slate-400">Manage Buildings → Floors → Rooms → Places, with departments assigned to places.</p>
                </div>
                <button
                    type="button"
                    onClick={openCreateModal}
                    disabled={isLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 py-3 font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
                >
                    <PlusCircle size={17} /> Add {details.singular}
                </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {resourceOrder.map((resource) => {
                    const item = resourceDetails[resource];
                    const Icon = item.icon;
                    const active = resource === activeResource;
                    return (
                        <button
                            key={resource}
                            type="button"
                            onClick={() => {
                                setActiveResource(resource);
                                setQuery("");
                                setError(null);
                                setNotice(null);
                            }}
                            className={`rounded-2xl border p-4 text-left transition ${active ? "border-sky-400 bg-sky-50 text-sky-800 dark:border-sky-500 dark:bg-sky-400/15 dark:text-sky-300" : "border-slate-200 bg-white/80 text-slate-600 hover:border-sky-300 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400"}`}
                        >
                            <Icon size={18} />
                            <p className="mt-3 text-sm font-semibold">{item.label}</p>
                            <p className="mt-1 text-2xl font-semibold">{data[resource].length}</p>
                        </button>
                    );
                })}
            </div>

            {relationshipIssueCount ? (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300">
                    <TriangleAlert size={18} className="mt-0.5 shrink-0" />
                    <div>
                        <p className="font-semibold">{relationshipIssueCount} existing relationship {relationshipIssueCount === 1 ? "issue" : "issues"} found</p>
                        <p className="mt-1 text-amber-700/80 dark:text-amber-200/70">Open the affected room or place with Edit, then select a valid parent record to repair it.</p>
                    </div>
                </div>
            ) : null}

            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                    <Search size={16} />
                    <span className="sr-only">Search {details.label.toLowerCase()}</span>
                    <input
                        value={query}
                        onChange={(inputEvent) => setQuery(inputEvent.target.value)}
                        placeholder={`Search ${details.label.toLowerCase()}`}
                        className="w-full bg-transparent text-sm text-slate-900 outline-none dark:text-white"
                    />
                </label>
            </div>

            {notice ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm capitalize text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">{notice}</div>
            ) : null}
            {error ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300">
                    <span className="flex items-center gap-2"><CircleAlert size={16} /> {error}</span>
                    {error.toLowerCase().includes("sign in") || error.toLowerCase().includes("session") ? <Link href="/" className="font-semibold underline">Sign in</Link> : null}
                </div>
            ) : null}

            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white/85 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left">
                        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-400">
                            <tr>
                                <th className="px-5 py-4 font-semibold">{details.singular}</th>
                                <th className="px-5 py-4 font-semibold">Relationship</th>
                                <th className="px-5 py-4 font-semibold">Details</th>
                                <th className="px-5 py-4 text-right font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {isLoading ? (
                                <tr><td colSpan={4} className="px-5 py-14 text-center text-slate-500 dark:text-slate-400"><span className="inline-flex items-center gap-2"><LoaderCircle size={18} className="animate-spin" /> Loading facilities…</span></td></tr>
                            ) : filteredRecords.length ? filteredRecords.map((record) => (
                                <tr key={record.id} className="transition hover:bg-slate-50/80 dark:hover:bg-white/[0.03]">
                                    <td className="px-5 py-4 font-semibold text-slate-900 dark:text-white">{recordName(activeResource, record)}</td>
                                    <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">{relationship(record)}</td>
                                    <td className="max-w-sm px-5 py-4 text-sm text-slate-500 dark:text-slate-400">{recordDetail(record)}</td>
                                    <td className="px-5 py-4">
                                        <div className="flex justify-end gap-2">
                                            <button type="button" onClick={() => openEditModal(record)} aria-label={`Edit ${recordName(activeResource, record)}`} className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-sky-500 dark:hover:bg-sky-400/10 dark:hover:text-sky-300"><Pencil size={16} /></button>
                                            <button type="button" onClick={() => deleteRecord(record)} disabled={deletingId === record.id} aria-label={`Delete ${recordName(activeResource, record)}`} className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:border-rose-500 dark:hover:bg-rose-400/10 dark:hover:text-rose-300">{deletingId === record.id ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}</button>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr><td colSpan={4} className="px-5 py-14 text-center"><p className="font-semibold text-slate-900 dark:text-white">No {details.label.toLowerCase()} found</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Add a record or change your search.</p></td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen ? (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={(mouseEvent) => { if (mouseEvent.target === mouseEvent.currentTarget) closeModal(); }}>
                    <div role="dialog" aria-modal="true" aria-labelledby="facility-modal-title" className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-8">
                        <div className="mb-6 flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-700 dark:text-sky-300">{editingRecord ? "Update" : "Create"} {details.singular}</p>
                                <h2 id="facility-modal-title" className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{editingRecord ? recordName(activeResource, editingRecord) : `Add a ${details.singular}`}</h2>
                            </div>
                            <button type="button" onClick={closeModal} disabled={isSaving} aria-label="Close facility modal" className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-white/5"><X size={18} /></button>
                        </div>

                        <form onSubmit={saveRecord} className="space-y-5">
                            {modalError ? <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300"><CircleAlert size={16} /> {modalError}</div> : null}

                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                <span className="mb-2 block">{activeResource === "rooms" ? "Room number or name" : activeResource === "floors" ? "Floor name" : `${details.singular[0].toUpperCase()}${details.singular.slice(1)} name`}</span>
                                <input autoFocus required minLength={activeResource === "rooms" || activeResource === "floors" ? 1 : 2} value={form.name} onChange={(inputEvent) => updateForm("name", inputEvent.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                            </label>

                            {activeResource === "buildings" ? <label className="block text-sm font-medium text-slate-700 dark:text-slate-300"><span className="mb-2 block">Address <span className="font-normal text-slate-400">(optional)</span></span><textarea rows={3} value={form.address} onChange={(inputEvent) => updateForm("address", inputEvent.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label> : null}

                            {activeResource === "floors" || activeResource === "rooms" ? (
                                <div className={`grid gap-4 ${activeResource === "rooms" ? "sm:grid-cols-2" : ""}`}>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300"><span className="mb-2 block">Building</span><select required value={form.building_id} onChange={(inputEvent) => changeBuilding(inputEvent.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="">Select building</option>{data.buildings.map((building) => <option key={building.id} value={building.id}>{building.building_name}</option>)}</select></label>
                                    {activeResource === "rooms" ? <label className="block text-sm font-medium text-slate-700 dark:text-slate-300"><span className="mb-2 block">Floor</span><select required value={form.floor_id} onChange={(inputEvent) => updateForm("floor_id", inputEvent.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="">Select floor</option>{floorsForBuilding.map((floor) => <option key={floor.id} value={floor.id}>{floor.floor_name}</option>)}</select></label> : null}
                                </div>
                            ) : null}

                            {activeResource === "rooms" ? <label className="block text-sm font-medium text-slate-700 dark:text-slate-300"><span className="mb-2 block">Maximum capacity <span className="font-normal text-slate-400">(optional)</span></span><input type="number" min={1} step={1} value={form.capacity} onChange={(inputEvent) => updateForm("capacity", inputEvent.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label> : null}

                            {activeResource === "places" ? (
                                <>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300"><span className="mb-2 block">Room</span><select required value={form.room_id} onChange={(inputEvent) => updateForm("room_id", inputEvent.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="">Select room</option>{data.rooms.map((room) => <option key={room.id} value={room.id}>{roomLocation(room.id)}</option>)}</select></label>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300"><span className="mb-2 block">Department <span className="font-normal text-slate-400">(optional)</span></span><select value={form.department_id} onChange={(inputEvent) => updateForm("department_id", inputEvent.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="">No department</option>{data.departments.map((department) => <option key={department.id} value={department.id}>{department.department_name}</option>)}</select></label>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300"><span className="mb-2 block">Directions <span className="font-normal text-slate-400">(optional)</span></span><textarea rows={3} value={form.direction} onChange={(inputEvent) => updateForm("direction", inputEvent.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
                                </>
                            ) : null}

                            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                                <button type="button" onClick={closeModal} disabled={isSaving} className="rounded-2xl border border-slate-200 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
                                <button type="submit" disabled={isSaving} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60">{isSaving ? <LoaderCircle size={17} className="animate-spin" /> : null}{isSaving ? "Saving…" : editingRecord ? "Save changes" : `Create ${details.singular}`}</button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
