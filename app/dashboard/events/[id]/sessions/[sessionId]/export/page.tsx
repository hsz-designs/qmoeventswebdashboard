import { SessionExportConfigurator } from "@/components/dashboard/session-export-configurator";

export default async function SessionExportPage({
    params,
}: {
    params: Promise<{ id: string; sessionId: string }>;
}) {
    const { id, sessionId } = await params;
    return <SessionExportConfigurator eventId={id} sessionId={sessionId} />;
}
