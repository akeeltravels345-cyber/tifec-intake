import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { listSessions, listInsurers, listCptCodes, getPracticeConfig, codeSummary } from "@/lib/billing";
import { insurancePortion, insuranceSettled, ageDays } from "@/lib/billingCalc";
import { caymanToday } from "@/lib/caymanTime";
import AgedClaimsReport, { type ClaimRow } from "@/components/billing/AgedClaimsReport";

export const dynamic = "force-dynamic";

// A printable report of one insurer's outstanding (unpaid, un-adjusted) claims,
// aged oldest-first, for the owner to present at an insurer meeting.
export default async function InsurerAgedClaimsPage({ params }: { params: Promise<{ insurerId: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/aged-claims");
  const isAdmin = user.clinician.contact === "admin";
  if (!isBiller(user.role) && !isOwner(user.role) && !isAdmin) redirect("/billing/me");

  const { insurerId } = await params;
  const [sessions, insurers, cptCodes, cfg] = await Promise.all([
    listSessions(), listInsurers(), listCptCodes(), getPracticeConfig(),
  ]);
  const insurer = insurers.find((i) => i.id === insurerId);
  if (!insurer) notFound();

  const today = caymanToday();
  const cptDesc = (code: string) => cptCodes.find((c) => c.code === code)?.description ?? "";
  const rows: ClaimRow[] = sessions
    .filter((s) => s.insurerId === insurerId && !insuranceSettled(s))
    .map((s) => ({
      id: s.id,
      client: `${s.clientFirst} ${s.clientLast}`.trim() || "Unnamed client",
      clientId: s.clientId,
      dateOfService: s.dateOfService,
      billedDate: s.billedDate ?? null,
      cpt: codeSummary(s.cptCodes, cptDesc) || s.cptCodes.join(", "),
      amount: insurancePortion(s),
      days: ageDays(s.dateOfService, today),
    }))
    .filter((r) => r.amount > 0);

  return (
    <div className="ac-page">
      <div className="ac-back ac-noprint"><Link href="/billing/aged-claims" className="ls-back">← All insurers</Link></div>
      <AgedClaimsReport
        rows={rows}
        insurerName={insurer.name}
        claimCode={insurer.claimCode ?? null}
        practiceName={cfg.provider?.practiceName || "TIFEC · Essential Care"}
        asOf={today}
      />
    </div>
  );
}
