import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { listAppointmentTypes } from "@/lib/scheduling";
import { seesAllSchedule, isTreatingClinician } from "../layout";
import BookingLinks from "@/components/scheduling/BookingLinks";

export const dynamic = "force-dynamic";

export default async function LinksPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/schedule/links");
  const me = user.clinician;
  if (!seesAllSchedule(me) && !isTreatingClinician(me)) redirect("/today");

  const types = (await listAppointmentTypes())
    .filter((t) => t.active)
    .map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className="sh-wrap">
      <div className="sh-bar"><a className="sh-back" href="/schedule">← Back to my agenda</a></div>
      <BookingLinks clinicianId={me.id} clinicianName={me.name} types={types} />
    </div>
  );
}
