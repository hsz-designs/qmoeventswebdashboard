export const EVENT_STATUSES = ["draft", "published", "completed", "cancelled"] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

export type EventRecord = {
    id: number;
    created_at: string;
    event_name: string;
    event_description: string;
    qrcode_value: string | null;
    start_datetime: string;
    end_datetime: string;
    status: EventStatus;
};

export type EventInput = Omit<EventRecord, "id" | "created_at">;
