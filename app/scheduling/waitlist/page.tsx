import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin, getClinician } from "@/lib/clinicians";
import { listWaitlist, listAppointmentTypes } from "@/lib/scheduling";
import WaitlistView from "@/components/scheduling/WaitlistView";

export const dynamic = "force-dynamic";

export default async function WaitlistPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/scheduling/waitlist");
  // The practice owner manages scheduling config too, not only the admin account.
  if (!isSystemAdmin(user.clinician) && user.clinician.contact !== "owner") redirect("/today");

  const [entries, types] = await Promise.all([listWaitlist(), listAppointmentTypes()]);
  const rows = entries.map((e) => ({
    ...e,
    typeName: types.find((t) => t.id === e.typeId)?.name || "",
    clinicianName: e.clinicianId ? (getClinician(e.clinicianId)?.name || "") : "",
  }));

  return (
    <div className="sh-wrap">
      <div className="sh-bar"><a className="sh-back" href="/schedule">← Back to my agenda</a></div>
      <WaitlistView initial={rows} />
    </div>
  );
}
