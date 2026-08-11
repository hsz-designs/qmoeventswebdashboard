import type { EventRecord } from "@/lib/events";
import type { EventSessionRecord } from "@/lib/event-sessions";
import type { AttendanceRecord, AttendanceSession, AttendanceState, UserRecord } from "@/lib/users";

export type EventAttendeeDetail = {
    attendance: AttendanceRecord;
    user: UserRecord | null;
    session: AttendanceSession | null;
    state: AttendanceState;
};

export type EventAttendeesResponse = {
    event: EventRecord;
    attendees: EventAttendeeDetail[];
};

export type AttendanceLogRecord = {
    id: number;
    created_at: string;
    event_id: number;
    user_id: string | null;
    date_time: string;
    date_index: number | null;
    session_id: number;
    log_type: number;
};

export type SessionAttendeesResponse = {
    event: EventRecord;
    session: EventSessionRecord;
    attendees: EventAttendeeDetail[];
};

export type AttendeeLogsResponse = {
    event: EventRecord;
    session: EventSessionRecord;
    attendee: EventAttendeeDetail;
    logs: AttendanceLogRecord[];
};

export type UnregisterAttendeeResponse = {
    unregisteredUserId: string;
    eventId: number;
    sessionId: number;
    deletedAttendanceRecords: number;
    deletedLogRecords: number;
};
