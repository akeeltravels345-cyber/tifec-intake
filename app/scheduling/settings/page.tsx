import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin, CLINICIANS } from "@/lib/clinicians";
import { getSchedulingSettings, listAppointmentTypes } from "@/lib/scheduling";
import { zoomConfigured, googleConfigured } from "@/lib/videoLinks";
import SchedulingTabs from "@/components/scheduling/SchedulingTabs";
import SchedulingSettingsView from "@/components/scheduling/SchedulingSettingsView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/scheduling/settings");
  if (!isSystemAdmin(user.clinician)) redirect("/today");
  const [settings, types] = await Promise.all([getSchedulingSettings(), listAppointmentTypes()]);
  const clinicians = CLINICIANS.filter((c) => !c.intakeHidden && c.contact !== "biller").map((c) => ({ id: c.id, name: c.name }));
  return (
    <div>
      <SchedulingTabs />
      <SchedulingSettingsView
        initial={settings}
        types={types.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }))}
        clinicians={clinicians}
        videoEnv={{ zoom: zoomConfigured(), google: googleConfigured() }}
      />
    </div>
  );
}
