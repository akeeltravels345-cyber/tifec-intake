import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingUser, isBiller } from "@/lib/billingRole";
import { listExternalClinicians, listInsurers, listCptCodes, listSessions } from "@/lib/billing";
import { insurancePortion } from "@/lib/billingCalc";
import OutsideClient from "@/components/billing/OutsideClient";
import SessionForm from "@/components/billing/SessionForm";

export const dynamic = "force-dynamic";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Clinicians outside the practice that the biller handles privately.
export default async function OutsidePage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/outside");
  // The biller's private book, not the practice's. Not the owner's business.
  if (!isBiller(user.role)) redirect("/billing/me");

  const [ext, all, insurers, cptCodes] = await Promise.all([
    listExternalClinicians(), listSessions(), listInsurers(), listCptCodes(),
  ]);

  const now = new Date();
  const mKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = MONTHS[now.getMonth()];

  const rows = ext.map((c) => {
    const billed = all.filter((s) => s.clinicianId === c.id && s.insurancePaid && s.paidDate?.slice(0, 7) === mKey);
    const collected = round2(billed.reduce((t, s) => t + insurancePortion(s), 0));
    return { ...c, claims: billed.length, collected, cut: round2((collected * c.billerPct) / 100) };
  });

  const activeInsurers = insurers.filter((i) => i.active).map((i) => ({ id: i.id, name: i.name, copayType: i.copayType, copayRate: i.copayRate }));
  const activeCpt = cptCodes.filter((c) => c.active).map((c) => ({ code: c.code, description: c.description, fee: c.fee ?? 0, hrs: c.hrs ?? 1 }));
  const forClinicians = ext.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name }));

  // Returning clients across the outside clinicians, so a repeat visit is one click.
  const seen = new Map<string, { first: string; last: string; insurerId: string | null; lastVisit: string; visits: number }>();
  for (const s of all.filter((s) => ext.some((c) => c.id === s.clinicianId)).sort((a, b) => b.dateOfService.localeCompare(a.dateOfService))) {
    const first = s.clientFirst?.trim() ?? "", last = s.clientLast?.trim() ?? "";
    if (!first && !last) continue;
    const k = `${first}|${last}`.toLowerCase();
    const prev = seen.get(k);
    if (prev) prev.visits += 1;
    else seen.set(k, { first, last, insurerId: s.insurerId, lastVisit: s.dateOfService, visits: 1 });
  }

  return (
    <>
      <Link href="/billing/biller" className="ls-back">← Back to my dashboard</Link>
      <div className="su-topbar">
        <h1 className="su-h1">Outside clients</h1>
        <p className="su-sub">
          Clinicians you bill for privately. They have no login here, and nothing they earn appears in TIFEC&apos;s revenue or payouts. The only money involved is your commission.
        </p>
      </div>

      <OutsideClient rows={rows} monthLabel={monthLabel} />

      {forClinicians.length > 0 && (
        <div className="su-sec">
          <div className="su-sechead">
            <h3 className="su-sech">Log a claim for one of them</h3>
            <span className="su-hint">It joins your billing queue like any other claim, and pays you when you mark it billed.</span>
          </div>
          <SessionForm insurers={activeInsurers} cptCodes={activeCpt} clients={[...seen.values()]} forClinicians={forClinicians} />
        </div>
      )}
    </>
  );
}
