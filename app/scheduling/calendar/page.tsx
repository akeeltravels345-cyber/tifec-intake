import { redirect } from "next/navigation";

// The calendar now lives in one place: the /schedule agenda. This old admin
// route redirects there so every entry point lands on the same view.
export const dynamic = "force-dynamic";

export default function SchedulingCalendarRedirect() {
  redirect("/schedule");
}
