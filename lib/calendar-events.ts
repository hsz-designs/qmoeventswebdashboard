export type CalendarSessionRecord = {
    id: number;
    session_topic: string;
    session_date: string;
    session_start_time: string;
    session_end_time: string;
    session_event_id: number;
    session_type: number | null;
    status: number | null;
    event: {
        id: number;
        event_name: string;
    };
};

export type CalendarEventsResponse = {
    sessions: CalendarSessionRecord[];
};
