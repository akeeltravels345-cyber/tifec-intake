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
  const insName = (id: string | null) => insurers.find((i) => i.id === id)?.name ?? "—";
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
    const ret = settingsList.find((s) => s.clinicianId === clinicianId)?.retentionPct ?? 0;
    return (insurance * (ret / 100) * cfg.billerCommissionPct) / 100;
  };

  const toClaim = (s: (typeof sessions)[number]): Claim => ({
    id: s.id, dos: s.dateOfService, age: ageDays(s.dateOfService, today),
    clinicianId: s.clinicianId, clinicianName: clinName(s.clinicianId),
    clientName: `${s.clientFirst} ${s.clientLast}`.trim(),
    insurerId: s.insurerId as string, insurerName: insName(s.insurerId),
    amount: insurancePortion(s), paid: s.insurancePaid, paidDate: s.paidDate,
    commission: r2(commissionOn(s.clinicianId, insurancePortion(s))),
  });

  const insured = sessions.filter((s) => s.insurerId && insurancePortion(s) > 0);
  const outstanding = insured.filter((s) => !s.insurancePaid).map(toClaim).sort((a, b) => b.age - a.age);
  const billed = insured.filter((s) => s.insurancePaid).map(toClaim).sort((a, b) => (b.paidDate || "").localeCompare(a.paidDate || ""));

  const outstandingTotal = r2(outstanding.reduce((t, c) => t + c.amount, 0));
  const billedThisMonthClaims = billed.filter((c) => c.paidDate?.slice(0, 7) === mKey);
  const buckets = AGING_BUCKETS.map((b, i) => {
    const inB = outstanding.filter((c) => agingBucketIndex(c.age) === i);
    return { label: b.label, color: BUCKET_COLORS[i], amount: r2(inB.reduce((t, c) => t + c.amount, 0)), count: inB.length };
  });

  const data: QueueData = {
    outstanding, billed,
    commissionThisMonth: r2(billedThisMonthClaims.reduce((t, c) => t + c.commission, 0)),
    waitingCommission: r2(outstanding.reduce((t, c) => t + c.commission, 0)),
    outstandingTotal,
    awaitingCount: outstanding.length,
    oldestDays: outstanding.length ? outstanding[0].age : 0,
    buckets,
    clinicians: [...CLINICIANS.map((c) => ({ id: c.id, name: c.name })), ...external.map((c) => ({ id: c.id, name: c.name }))]
      .filter((c) => insured.some((s) => s.clinicianId === c.id)),
    today,
  };

  return <BillingQueueClient data={data} />;
}
