import { UserAttendance } from "@/components/dashboard/user-attendance";

export default async function UserAttendancePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return <UserAttendance userId={id} />;
}
