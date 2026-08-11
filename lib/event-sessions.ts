import type { EventRecord } from "@/lib/events";

export type EventSessionRecord = {
    id: number;
    created_at: string;
    session_topic: string;
    session_speaker_id: string | null;
    session_date: string;
    session_start_time: string;
    session_end_time: string;
    session_building_id: number;
    session_floor_id: number;
    session_room_id: number;
    session_event_id: number;
    session_type: number | null;
    session_max_capacity: number | null;
    status: number | null;
};

export type EventSessionInput = Omit<
    EventSessionRecord,
    "id" | "created_at" | "session_event_id" | "session_type" | "status"
> & {
    session_type: 1 | 2;
    status: 0 | 1;
};

export type BuildingOption = {
    id: number;
    building_name: string;
};

export type FloorOption = {
    id: number;
    building_id: number;
    floor_name: string;
};

export type RoomOption = {
    id: number;
    building_id: number;
    floor_id: number;
    room_no: string;
    room_max_capacity: number | null;
};

export type SessionLocations = {
    buildings: BuildingOption[];
    floors: FloorOption[];
    rooms: RoomOption[];
};

export type EventSessionsResponse = {
    event: EventRecord;
    sessions: EventSessionRecord[];
    locations: SessionLocations;
};
