import { redirect } from "next/navigation";
import { getBillingUser, canMarkBilled } from "@/lib/billingRole";
import { listSessions, listInsurers, listExternalClinicians, listClinicianSettings, getPracticeConfig } from "@/lib/billing";
import { insurancePortion, ageDays, AGING_BUCKETS, agingBucketIndex } from "@/lib/billingCalc";
import { getClinician, CLINICIANS } from "@/lib/clinicians";
import BillingQueueClient, { type Claim, type QueueData } from "@/components/billing/BillingQueueClient";

export const dynamic = "force-dynamic";
const r2 = (n: number) => Math.round(n * 100) / 100;
const BUCKET_COLORS = ["#2c7a55", "#BE8127", "#C06A1F", "#9a3b2a"];

export default async function BillingQueuePage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/payments");
  if (!canMarkBilled(user.role)) redirect("/billing/me");

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const mKey = today.slice(0, 7);
  const [sessions, insurers, external, settingsList, cfg] = await Promise.all([listSessions(), listInsurers(), listExternalClinicians(), listClinicianSettings(), getPracticeConfig()]);
  const insName = (id: string | null) =>
    insurers.find((i) => i.id === id)?.name ?? (id ? "Unknown insurer" : "Self-pay");
  // Outside clinicians aren't on the roster, so resolve their names too.
  const clinName = (id: string) => getClinician(id)?.name ?? external.find((c) => c.id === id)?.name ?? id;
  // Same rule as the biller dashboard: a % of the company retention for TIFEC
  // clinicians, their own rate on collections for outside clients.
  // Matches the dashboard exactly: real clinicians and outside clients earn
  // commission; the admin/test account does not.
  const commissionOn = (clinicianId: string, insurance: number) => {
    const e = external.find((c) => c.id === clinicianId);
    if (e) return (insurance * e.billerPct) / 100;
    if (!CLINICIANS.some((c) => c.id === clinicianId && !c.intakeHidden)) return 0;
    const st = settingsList.find((s) => s.clinicianId === clinicianId);
    const fromCompany = (insurance * ((st?.retentionPct ?? 0) / 100) * cfg.billerCommissionPct) / 100;
    const fromClinician = (insurance * (st?.billerPct ?? 0)) / 100;
    return fromCompany + fromClinician;
  };

  const toClaim = (s: (typeof sessions)[number]): Claim => ({
    id: s.id, dos: s.dateOfService, age: ageDays(s.dateOfService, today),
    clinicianId: s.clinicianId, clinicianName: clinName(s.clinicianId),
    clientName: `${s.clientFirst} ${s.clientLast}`.trim(),
    insurerId: s.insurerId as string, insurerName: insName(s.insurerId),
    amount: insurancePortion(s), billedDate: s.billedDate, paid: s.insurancePaid, paidDate: s.paidDate,
    commission: r2(commissionOn(s.clinicianId, insurancePortion(s))),
  });

  // Whose claims the biller reconciles: practising clinicians only. Not the
  // biller himself (you don't bill for the biller) and not the hidden admin/
  // test account. Active outside clinicians count too.
  const billForIds = new Set([
    ...CLINICIANS.filter((c) => !c.intakeHidden && c.billing !== "biller").map((c) => c.id),
    ...external.filter((c) => c.active).map((c) => c.id),
  ]);

  // A claim moves through three stages, each its own tab:
  //   to bill  = logged, not yet submitted to the insurer (no billed_date)
  //   awaiting = submitted, waiting on the insurer to pay (billed_date, not paid)
  //   paid     = insurer settled (this is COLLECTED money — it feeds payouts)
  const insured = sessions.filter((s) => s.insurerId && insurancePortion(s) > 0 && billForIds.has(s.clinicianId));
  const toBill = insured.filter((s) => !s.insurancePaid && !s.billedDate).map(toClaim).sort((a, b) => b.age - a.age);
  const awaiting = insured.filter((s) => !s.insurancePaid && !!s.billedDate).map(toClaim).sort((a, b) => b.age - a.age);
  const paid = insured.filter((s) => s.insurancePaid).map(toClaim).sort((a, b) => (b.paidDate || "").localeCompare(a.paidDate || ""));

  // Everything not yet collected (both open stages) drives the outstanding total
  // and the aging chips.
  const open = [...toBill, ...awaiting];
  const outstandingTotal = r2(open.reduce((t, c) => t + c.amount, 0));
  const awaitingTotal = r2(awaiting.reduce((t, c) => t + c.amount, 0));
  const paidThisMonthClaims = paid.filter((c) => c.paidDate?.slice(0, 7) === mKey);
  const collectedThisMonth = r2(paidThisMonthClaims.reduce((t, c) => t + c.amount, 0));
  const buckets = AGING_BUCKETS.map((b, i) => {
    const inB = open.filter((c) => agingBucketIndex(c.age) === i);
    return { label: b.label, color: BUCKET_COLORS[i], amount: r2(inB.reduce((t, c) => t + c.amount, 0)), count: inB.length };
  });

  const data: QueueData = {
    toBill, awaiting, paid,
    commissionThisMonth: r2(paidThisMonthClaims.reduce((t, c) => t + c.commission, 0)),
    waitingCommission: r2(open.reduce((t, c) => t + c.commission, 0)),
    outstandingTotal, awaitingTotal, collectedThisMonth,
    toBillCount: toBill.length,
    awaitingCount: awaiting.length,
    oldestDays: open.length ? Math.max(...open.map((c) => c.age)) : 0,
    buckets,
    // Every clinician the biller bills for — listed even with no claims yet, so
    // Sofia is selectable before her first one.
    clinicians: [
      ...CLINICIANS.filter((c) => !c.intakeHidden && c.billing !== "biller").map((c) => ({ id: c.id, name: c.name })),
      ...external.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name })),
    ],
    today,
  };

  return <BillingQueueClient data={data} />;
}
