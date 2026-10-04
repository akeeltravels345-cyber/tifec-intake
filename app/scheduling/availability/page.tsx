import { redirect } from "next/navigation";

// Availability is now edited in one place: "My hours" on the /schedule agenda
// (same editor, and owner/Donnet can still pick any clinician there).
export const dynamic = "force-dynamic";

export default function SchedulingAvailabilityRedirect() {
  redirect("/schedule/hours");
}
