import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingUser, isOwner, isBiller } from "@/lib/billingRole";
import { listSessions, listInsurers, getClinicianSettings, getPracticeConfig, listCptCodes, codeSummary } from "@/lib/billing";
import { computeClinicianMonth } from "@/lib/billingCalc";
import { getClinician } from "@/lib/clinicians";
import { caymanToday, caymanYearMonth } from "@/lib/caymanTime";
import MonthNav from "@/components/billing/MonthNav";
import CollectionsReport, { type CollRow } from "@/components/billing/CollectionsReport";

export const dynamic = "force-dynamic";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// A printable, per-clinician "insurance collected in <month>" report for
// reconciling against the insurers' own payment reports.
export default async function CollectionsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ y?: string; m?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/me");
  const { id } = await params;
  const isAdmin = user.clinician.contact === "admin";
  if (!isOwner(user.role) && !isBiller(user.role) && !isAdmin && id !== user.clinician.id) redirect(`/billing/clinician/${user.clinician.id}/collections`);
  const clinician = getClinician(id);
  if (!clinician) redirect(isOwner(user.role) ? "/billing/overview" : "/billing/me");

  const sp = await searchParams;
  const nowYM = caymanYearMonth();
  const year = Number(sp.y) || nowYM.year;
  const month = Number(sp.m) || nowYM.month;

  const [all, insurers, settings, cfg, cptCodes] = await Promise.all([
    listSessions({ clinicianId: id }), listInsurers(), getClinicianSettings(id), getPracticeConfig(), listCptCodes(),
  ]);
  const c = computeClinicianMonth(all, settings, year, month, cfg.billerCommissionPct);
  const insurerName = (iid: string | null) => insurers.find((i) => i.id === iid)?.name ?? (iid ? "Unknown insurer" : "Self-pay");
  const cptDesc = (code: string) => cptCodes.find((x) => x.code === code)?.description ?? "";
  const sessById = new Map(all.map((s) => [s.id, s] as const));

  const rows: CollRow[] = c.insuranceCollectedItems.map((it) => {
    const s = sessById.get(it.sessionId);
    return {
      client: s ? `${s.clientFirst} ${s.clientLast}`.trim() || "Unnamed client" : "Unnamed client",
      dateOfService: it.dateOfService,
      paidDate: it.paidDate,
      insurer: insurerName(it.insurerId),
      cpt: s ? codeSummary(s.cptCodes, cptDesc) : "",
      amount: it.amount,
      fromThisMonth: it.fromThisMonth,
    };
  });

  return (
    <div className="ac-page">
      <div className="ac-back ac-noprint">
        <Link href={`/billing/clinician/${id}?y=${year}&m=${month}`} className="ls-back">← Back to payout</Link>
        <span style={{ display: "inline-block", marginLeft: 14 }}><MonthNav year={year} month={month} path={`/billing/clinician/${id}/collections`} /></span>
      </div>
      <CollectionsReport
        rows={rows}
        clinicianName={clinician.name}
        monthLabel={`${MONTHS[month - 1]} ${year}`}
        practiceName={cfg.provider?.practiceName || "TIFEC · Essential Care"}
        thisMonth={c.insuranceThisMonthVisits}
        prior={c.insurancePriorVisits}
        total={c.insuranceBilledThisMonth}
        asOf={caymanToday()}
      />
    </div>
  );
}
