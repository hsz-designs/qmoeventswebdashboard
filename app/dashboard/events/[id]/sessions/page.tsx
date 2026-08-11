import { SessionsManager } from "@/components/dashboard/sessions-manager";

export default async function EventSessionsPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return <SessionsManager eventId={id} />;
}
