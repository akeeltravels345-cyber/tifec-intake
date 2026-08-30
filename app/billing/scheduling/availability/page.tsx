import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin, CLINICIANS } from "@/lib/clinicians";
import { getAvailability } from "@/lib/scheduling";
import SchedulingTabs from "@/components/billing/SchedulingTabs";
import AvailabilityManager from "@/components/billing/AvailabilityManager";

export const dynamic = "force-dynamic";

// The clinicians who actually see clients — not the biller or the admin account.
const bookable = CLINICIANS.filter((c) => !c.intakeHidden && c.contact !== "biller");

export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/scheduling/availability");
  if (!isSystemAdmin(user.clinician)) redirect("/today");

  const sp = await searchParams;
  const selectedId = bookable.find((c) => c.id === sp.c)?.id ?? bookable[0]?.id ?? "";
  const initial = selectedId ? await getAvailability(selectedId) : { clinicianId: "", weekly: [], overrides: [], minNoticeHours: 12, bookAheadDays: 60, maxPerDay: 0, slotIntervalMin: 30, updatedAt: "" };

  return (
    <div>
      <SchedulingTabs />
      <AvailabilityManager clinicians={bookable.map((c) => ({ id: c.id, name: c.name }))} selectedId={selectedId} initial={initial} />
    </div>
  );
}
