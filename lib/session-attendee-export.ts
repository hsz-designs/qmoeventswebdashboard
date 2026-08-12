import type { EventRecord } from "@/lib/events";
import type { EventSessionRecord } from "@/lib/event-sessions";
import type { AttendanceRecord, UserRecord } from "@/lib/users";
import { userDisplayName } from "@/lib/users";
import type { WorkbookValue } from "@/lib/excel-workbook";

export const SESSION_ATTENDEE_EXPORT_COLUMNS = [
    { key: "eventTitle", label: "Event Title" },
    { key: "sessionId", label: "Session ID" },
    { key: "sessionTopic", label: "Session Topic" },
    { key: "sessionDate", label: "Session Date" },
    { key: "startTime", label: "Start Time" },
    { key: "endTime", label: "End Time" },
    { key: "venue", label: "Venue" },
    { key: "attendeeRecordId", label: "Attendee Record ID" },
    { key: "userId", label: "User ID" },
    { key: "attendeeName", label: "Attendee Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "firstCheckIn", label: "First Check-in" },
    { key: "lastCheckOut", label: "Last Check-out" },
    { key: "attendanceState", label: "Attendance State" },
    { key: "statusCode", label: "Status Code" },
    { key: "eventDayIndex", label: "Event Day Index" },
] as const;

export type SessionAttendeeExportFieldKey =
    (typeof SESSION_ATTENDEE_EXPORT_COLUMNS)[number]["key"];

export type SessionAttendeeExportRow = Record<SessionAttendeeExportFieldKey, WorkbookValue>;

export type SessionAttendeeExportSelection = {
    key: SessionAttendeeExportFieldKey;
    label: string;
};

export type SessionAttendeeExportPreview = {
    event: {
        id: number;
        name: string;
    };
    session: {
        id: number;
        topic: string;
        date: string;
    };
    columns: typeof SESSION_ATTENDEE_EXPORT_COLUMNS;
    rowCount: number;
    sampleRows: SessionAttendeeExportRow[];
};

type CreateExportRowOptions = {
    event: EventRecord;
    session: EventSessionRecord;
    venue: string;
    attendance: AttendanceRecord;
    profile: UserRecord | null;
};

function attendeeName(attendance: AttendanceRecord, profile: UserRecord | null) {
    if (profile) return userDisplayName(profile);
    if (attendance.user_id) return `User ${attendance.user_id}`;
    return "Unknown attendee";
}

function attendanceState(attendance: AttendanceRecord) {
    if (attendance.date_time_first_in && !attendance.date_time_last_out) {
        return "Currently attending";
    }
    if (attendance.date_time_first_in) return "Attended";
    return "Registered";
}

export function createSessionAttendeeExportRow({
    event,
    session,
    venue,
    attendance,
    profile,
}: CreateExportRowOptions): SessionAttendeeExportRow {
    return {
        eventTitle: event.event_name,
        sessionId: session.id,
        sessionTopic: session.session_topic,
        sessionDate: session.session_date,
        startTime: session.session_start_time,
        endTime: session.session_end_time,
        venue,
        attendeeRecordId: attendance.id,
        userId: attendance.user_id,
        attendeeName: attendeeName(attendance, profile),
        email: profile?.email || "",
        phone: profile?.phone || "",
        firstCheckIn: attendance.date_time_first_in,
        lastCheckOut: attendance.date_time_last_out,
        attendanceState: attendanceState(attendance),
        statusCode: attendance.status,
        eventDayIndex: attendance.date_index,
    };
}

export function defaultSessionAttendeeExportSelection(): SessionAttendeeExportSelection[] {
    return SESSION_ATTENDEE_EXPORT_COLUMNS.map((column) => ({ ...column }));
}
