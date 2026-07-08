import { redirect } from "next/navigation";
import { getBillingUser, canMarkBilled } from "@/lib/billingRole";
import { listSessions, listInsurers, getPracticeConfig } from "@/lib/billing";
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
  const [sessions, insurers, cfg] = await Promise.all([listSessions(), listInsurers(), getPracticeConfig()]);
  const insName = (id: string | null) => insurers.find((i) => i.id === id)?.name ?? "—";

  const toClaim = (s: (typeof sessions)[number]): Claim => ({
    id: s.id, dos: s.dateOfService, age: ageDays(s.dateOfService, today),
    clinicianId: s.clinicianId, clinicianName: getClinician(s.clinicianId)?.name ?? s.clinicianId,
    clientName: `${s.clientFirst} ${s.clientLast}`.trim(),
    insurerId: s.insurerId as string, insurerName: insName(s.insurerId),
    amount: insurancePortion(s), paid: s.insurancePaid, paidDate: s.paidDate,
  });

  const insured = sessions.filter((s) => s.insurerId && insurancePortion(s) > 0);
  const outstanding = insured.filter((s) => !s.insurancePaid).map(toClaim).sort((a, b) => b.age - a.age);
  const billed = insured.filter((s) => s.insurancePaid).map(toClaim).sort((a, b) => (b.paidDate || "").localeCompare(a.paidDate || ""));

  const pct = cfg.billerCommissionPct;
  const outstandingTotal = r2(outstanding.reduce((t, c) => t + c.amount, 0));
  const billedThisMonth = r2(billed.filter((c) => c.paidDate?.slice(0, 7) === mKey).reduce((t, c) => t + c.amount, 0));
  const buckets = AGING_BUCKETS.map((b, i) => {
    const inB = outstanding.filter((c) => agingBucketIndex(c.age) === i);
    return { label: b.label, color: BUCKET_COLORS[i], amount: r2(inB.reduce((t, c) => t + c.amount, 0)), count: inB.length };
  });

  const data: QueueData = {
    outstanding, billed,
    commissionPct: pct,
    commissionThisMonth: r2((billedThisMonth * pct) / 100),
    billedThisMonth,
    waitingCommission: r2((outstandingTotal * pct) / 100),
    outstandingTotal,
    awaitingCount: outstanding.length,
    oldestDays: outstanding.length ? outstanding[0].age : 0,
    buckets,
    clinicians: CLINICIANS.filter((c) => insured.some((s) => s.clinicianId === c.id)).map((c) => ({ id: c.id, name: c.name })),
    today,
  };

  return <BillingQueueClient data={data} />;
}
