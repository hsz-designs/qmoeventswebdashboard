import type { EventRecord } from "@/lib/events";
import type { UserRecord } from "@/lib/users";

export const ATTENDANCE_SCAN_ACTIONS = {
    login: {
        status: 1,
        label: "Log in",
        shortLabel: "Logged in",
        description: "Check in or return from break",
    },
    break: {
        status: 67,
        label: "Start break",
        shortLabel: "On break",
        description: "Record a temporary exit",
    },
    complete: {
        status: 2,
        label: "Complete",
        shortLabel: "Completed",
        description: "Record the final check-out",
    },
} as const;

export type AttendanceScanAction = keyof typeof ATTENDANCE_SCAN_ACTIONS;
export type AttendanceScanStatus = (typeof ATTENDANCE_SCAN_ACTIONS)[AttendanceScanAction]["status"];

export type EventScannerTotals = {
    registered: number;
    loggedIn: number;
    onBreak: number;
    completed: number;
};

export type EventScannerActivity = {
    id: string;
    scannedAt: string;
    action: AttendanceScanAction;
    status: AttendanceScanStatus;
    user: UserRecord;
    registrationsUpdated: number;
    sessionTopics: string[];
};

export type EventScannerResponse = {
    event: EventRecord;
    totals: EventScannerTotals;
    recentActivity: EventScannerActivity[];
};

export type EventScanMutationResponse = {
    message: string;
    activity: EventScannerActivity;
    totals: EventScannerTotals;
};

export function actionForAttendanceStatus(status: number): AttendanceScanAction | null {
    const entry = Object.entries(ATTENDANCE_SCAN_ACTIONS).find(
        ([, details]) => details.status === status,
    );
    return (entry?.[0] as AttendanceScanAction | undefined) || null;
}

export function attendanceStatusLabel(status: number) {
    const action = actionForAttendanceStatus(status);
    return action ? ATTENDANCE_SCAN_ACTIONS[action].shortLabel : `Status ${status}`;
}
