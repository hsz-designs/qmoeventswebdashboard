import { EventAttendees } from "@/components/dashboard/event-attendees";

export default async function EventAttendeesPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return <EventAttendees eventId={id} />;
}
