import { CalendarView } from "@/components/dashboard/calendar-view";

export default function CalendarPage() {
    return (
        <div className="space-y-6">
            <div>
                <p className="text-sm font-medium uppercase tracking-[0.3em] text-sky-700 dark:text-cyan-300">Timeline</p>
                <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Interactive calendar</h1>
                <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-400">Browse visible event sessions by their session date, topic, and related event name.</p>
            </div>
            <CalendarView />
        </div>
    );
}
