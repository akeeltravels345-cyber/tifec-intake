import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { CLINICIANS } from "@/lib/clinicians";
import { getAvailability } from "@/lib/scheduling";
import AvailabilityManager from "@/components/scheduling/AvailabilityManager";
import { seesAllSchedule, isTreatingClinician } from "../layout";

export const dynamic = "force-dynamic";

const bookable = CLINICIANS.filter((c) => !c.intakeHidden && c.contact !== "biller");

// A clinician sets their own weekly hours here; owner/Donnet can set anyone's.
export default async function MyHoursPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/schedule/hours");
  const me = user.clinician;
  const all = seesAllSchedule(me);
  if (!all && !isTreatingClinician(me)) redirect("/today");

  const visible = all ? bookable : bookable.filter((c) => c.id === me.id);
  const selectedId = visible.find((c) => c.id === me.id)?.id ?? visible[0]?.id ?? "";
  const initial = selectedId ? await getAvailability(selectedId)
    : { clinicianId: "", weekly: [], overrides: [], minNoticeHours: 12, bookAheadDays: 60, maxPerDay: 0, slotIntervalMin: 30, updatedAt: "" };

  return (
    <div className="sh-wrap">
      <div className="sh-bar"><a className="sh-back" href="/schedule">← Back to my agenda</a></div>
      <AvailabilityManager clinicians={visible.map((c) => ({ id: c.id, name: c.name }))} selectedId={selectedId} initial={initial} />
    </div>
  );
}
