import { EventScanner } from "@/components/dashboard/event-scanner";

export default async function EventScannerPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return <EventScanner eventId={id} />;
}
