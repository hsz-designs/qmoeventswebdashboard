import type { EventRecord } from "@/lib/events";

export type UserRole = 1 | 2;

export type UserCreateInput = {
    email: string;
    password: string;
    username: string | null;
    firstname: string | null;
    lastname: string | null;
    middlename: string | null;
    ext: string | null;
    phone: string | null;
    role: UserRole;
};

export type UserUpdateInput = Omit<UserCreateInput, "password">;

export type UserRecord = {
    id: number;
    created_at: string | null;
    username: string | null;
    email: string;
    role: number;
    firstname: string | null;
    lastname: string | null;
    middlename: string | null;
    ext: string | null;
    phone: string | null;
    is_active: boolean | number | null;
    user_qr_code: string | null;
    auth_user_id: string | null;
};

export type AttendanceRecord = {
    id: number;
    created_at: string;
    user_id: string | null;
    event_id: number;
    date_time_first_in: string | null;
    date_time_last_out: string | null;
    date_index: number | null;
    status: number;
    session_id: number;
};

export type AttendanceSession = {
    id: number;
    session_topic: string;
    session_date: string;
    session_start_time: string;
    session_end_time: string;
};

export type AttendanceState = "currently_attending" | "attended" | "registered";

export type UserEventAttendance = {
    event: EventRecord | null;
    event_id: number;
    state: AttendanceState;
    records: AttendanceRecord[];
    sessions: AttendanceSession[];
    first_check_in: string | null;
    last_check_out: string | null;
};

export type UserAttendanceResponse = {
    user: UserRecord;
    attendance: UserEventAttendance[];
};

export function userDisplayName(user: UserRecord) {
    const fullName = [user.firstname, user.middlename, user.lastname, user.ext]
        .filter(Boolean)
        .join(" ");
    return fullName || user.username || user.email;
}
