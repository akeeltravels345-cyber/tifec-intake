import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import { getSchedulingSettings, listAppointmentTypes } from "@/lib/scheduling";
import SchedulingSettingsView from "@/components/scheduling/SchedulingSettingsView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/scheduling/settings");
  // The practice owner manages scheduling config too, not only the admin account.
  if (!isSystemAdmin(user.clinician) && user.clinician.contact !== "owner") redirect("/today");
  const [settings, types, h] = await Promise.all([getSchedulingSettings(), listAppointmentTypes(), headers()]);
  // Build the absolute origin on the server so the shareable links render the
  // same on server and client (no hydration mismatch).
  const origin = process.env.APP_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;
  return (
    <div className="sh-wrap">
      <div className="sh-bar"><a className="sh-back" href="/schedule">← Back to my agenda</a></div>
      <SchedulingSettingsView initial={settings} types={types.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }))} origin={origin} />
    </div>
  );
}
