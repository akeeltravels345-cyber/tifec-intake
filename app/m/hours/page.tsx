import { redirect } from "next/navigation";
import { inScheduleBeta, isBookableClinician, CLINICIANS } from "@/lib/clinicians";
import { getBillingUser } from "@/lib/billingRole";
import { getAvailability } from "@/lib/scheduling";
import AvailabilityManager from "@/components/scheduling/AvailabilityManager";
import { seesAllSchedule } from "../../schedule/layout";

export const dynamic = "force-dynamic";

// Mobile availability editor — reuses the same AvailabilityManager as the web
// /schedule/hours page, kept inside the /m app so the bottom nav stays put.
const bookable = CLINICIANS.filter((c) => isBookableClinician(c) && !c.test);

export default async function MobileHoursPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/m/hours");
  const me = user.clinician;
  if (!inScheduleBeta(me)) redirect("/today");

  const all = seesAllSchedule(me);
  const self = CLINICIANS.find((c) => c.id === me.id);
  const visible = all ? bookable : (self ? [self] : []);
  const selectedId = visible.find((c) => c.id === me.id)?.id ?? visible[0]?.id ?? "";
  const initial = selectedId ? await getAvailability(selectedId)
    : { clinicianId: "", weekly: [], overrides: [], minNoticeHours: 12, bookAheadDays: 60, maxPerDay: 0, slotIntervalMin: 30, busyFeeds: [], updatedAt: "" };

  return (
    <div className="sh-wrap">
      <div className="sh-bar"><a className="sh-back" href="/m">← Back to calendar</a></div>
      <AvailabilityManager clinicians={visible.map((c) => ({ id: c.id, name: c.name }))} selectedId={selectedId} initial={initial} />
    </div>
  );
}
