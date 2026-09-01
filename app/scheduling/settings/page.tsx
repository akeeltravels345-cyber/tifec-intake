import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import { getSchedulingSettings } from "@/lib/scheduling";
import SchedulingTabs from "@/components/scheduling/SchedulingTabs";
import SchedulingSettingsView from "@/components/scheduling/SchedulingSettingsView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/scheduling/settings");
  if (!isSystemAdmin(user.clinician)) redirect("/today");
  const settings = await getSchedulingSettings();
  return (
    <div>
      <SchedulingTabs />
      <SchedulingSettingsView initial={settings} />
    </div>
  );
}
