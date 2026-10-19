import { redirect } from "next/navigation";
import { inScheduleBeta } from "@/lib/clinicians";
import { getBillingUser } from "@/lib/billingRole";
import { listNotifications } from "@/lib/notifications";
import { getClinicianPrefs } from "@/lib/clinicianPrefs";
import { pushConfigured } from "@/lib/push";
import MobileNotifications from "@/components/scheduling/MobileNotifications";

export const dynamic = "force-dynamic";

export default async function MobileNotificationsPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/m/notifications");
  const me = user.clinician;
  if (!inScheduleBeta(me)) redirect("/today");

  const [items, prefs] = await Promise.all([
    listNotifications(me.id, 50),
    getClinicianPrefs(me.id),
  ]);

  return (
    <MobileNotifications
      items={items}
      remindersOn={prefs.apptReminders}
      pushAvailable={pushConfigured()}
    />
  );
}
