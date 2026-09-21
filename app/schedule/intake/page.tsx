import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { getClinician } from "@/lib/clinicians";
import { listIntakeGaps } from "@/lib/intakeReminders";
import { caymanWhen } from "@/lib/caymanTime";
import { seesAllSchedule, isTreatingClinician } from "../layout";
import IntakeGaps from "@/components/scheduling/IntakeGaps";

export const dynamic = "force-dynamic";

const SOON_MS = 48 * 3600 * 1000; // flag anyone whose visit is within 48 hours

export default async function IntakePage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/schedule/intake");
  const me = user.clinician;
  const all = seesAllSchedule(me);
  if (!all && !isTreatingClinician(me)) redirect("/today");

  const scopeId = all ? undefined : me.id;
  const gaps = await listIntakeGaps(scopeId);
  const now = Date.now();
  const rows = gaps.map((g) => ({
    id: g.id, clientName: g.clientName, serviceName: g.serviceName,
    clinicianName: all ? (getClinician(g.clinicianId)?.name || g.clinicianId) : "",
    whenText: caymanWhen(g.startAt),
    soon: Date.parse(g.startAt) - now <= SOON_MS,
    missingLabels: g.missingLabels, reminderSentAt: g.reminderSentAt ? caymanWhen(g.reminderSentAt) : null,
    hasEmail: g.hasEmail,
  }));

  return (
    <div className="sh-wrap">
      <div className="sh-bar"><a className="sh-back" href="/schedule">← Back to my agenda</a></div>
      <div className="sr">
        <div className="sr-head">
          <div>
            <h1 className="sr-h1">Intake to chase</h1>
            <p className="sr-sub">{all ? "Clients across the practice" : "Your clients"} with an appointment coming up who haven&apos;t finished their intake yet.</p>
          </div>
        </div>
        <IntakeGaps rows={rows} showClinician={all} />
      </div>
    </div>
  );
}
