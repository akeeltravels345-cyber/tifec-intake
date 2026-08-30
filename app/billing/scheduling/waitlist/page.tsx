import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin, getClinician } from "@/lib/clinicians";
import { listWaitlist, listAppointmentTypes } from "@/lib/scheduling";
import SchedulingTabs from "@/components/billing/SchedulingTabs";
import WaitlistView from "@/components/billing/WaitlistView";

export const dynamic = "force-dynamic";

export default async function WaitlistPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/scheduling/waitlist");
  if (!isSystemAdmin(user.clinician)) redirect("/today");

  const [entries, types] = await Promise.all([listWaitlist(), listAppointmentTypes()]);
  const rows = entries.map((e) => ({
    ...e,
    typeName: types.find((t) => t.id === e.typeId)?.name || "",
    clinicianName: e.clinicianId ? (getClinician(e.clinicianId)?.name || "") : "",
  }));

  return (
    <div>
      <SchedulingTabs />
      <WaitlistView initial={rows} />
    </div>
  );
}
