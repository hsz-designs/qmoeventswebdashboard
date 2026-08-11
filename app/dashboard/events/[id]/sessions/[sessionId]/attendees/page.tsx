import { SessionAttendees } from "@/components/dashboard/session-attendees";

export default async function SessionAttendeesPage({
    params,
}: {
    params: Promise<{ id: string; sessionId: string }>;
}) {
    const { id, sessionId } = await params;
    return <SessionAttendees eventId={id} sessionId={sessionId} />;
}
