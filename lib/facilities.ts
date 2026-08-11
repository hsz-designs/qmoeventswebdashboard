export type BuildingRecord = {
    id: number;
    created_at: string;
    building_name: string;
    address: string | null;
};

export type DepartmentRecord = {
    id: number;
    created_at: string;
    department_name: string;
};

export type FloorRecord = {
    id: number;
    created_at: string;
    building_id: number;
    floor_name: string;
};

export type RoomRecord = {
    id: number;
    created_at: string;
    room_no: string;
    building_id: number;
    floor_id: number;
    room_max_capacity: number | null;
};

export type PlaceRecord = {
    id: number;
    created_at: string;
    place_name: string;
    room_id: number;
    department_id: number | null;
    direction: string | null;
};

export type FacilityData = {
    buildings: BuildingRecord[];
    departments: DepartmentRecord[];
    floors: FloorRecord[];
    rooms: RoomRecord[];
    places: PlaceRecord[];
};

export type FacilityResource = keyof FacilityData;

export type FacilityRecord = FacilityData[FacilityResource][number];
