import { redirect } from "next/navigation";
import { getBillingUser, canMarkBilled } from "@/lib/billingRole";
import { listSessions, listInsurers, listExternalClinicians, listClinicianSettings, getPracticeConfig } from "@/lib/billing";
import { insurancePortion, selfPayOutstanding, ageDays, AGING_BUCKETS, agingBucketIndex, insuranceSettled, insuranceCash } from "@/lib/billingCalc";
import { listAllClients } from "@/lib/clients";
import { chargeAfterReferral } from "@/lib/referral";
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
  const [sessions, insurers, external, settingsList, cfg, allClients] = await Promise.all([listSessions(), listInsurers(), listExternalClinicians(), listClinicianSettings(), getPracticeConfig(), listAllClients()]);
  // client_id → referral end date, to flag claims dated after a referral ended.
  const referralEndOf = new Map(allClients.map((c) => [c.id, c.profile.referral?.endDate]));
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
    clientId: s.clientId,
    clientName: `${s.clientFirst} ${s.clientLast}`.trim(),
    insurerId: s.insurerId as string, insurerName: insName(s.insurerId),
    amount: insurancePortion(s), billedDate: s.billedDate, paid: s.insurancePaid, paidDate: s.paidDate,
    commission: r2(commissionOn(s.clinicianId, insurancePortion(s))),
    afterReferral: s.clientId ? chargeAfterReferral(s.dateOfService, referralEndOf.get(s.clientId)) : false,
  });

  // Whose claims the biller reconciles: practising clinicians only. Not the
  // biller himself (you don't bill for the biller) and not the hidden admin/
  // test account. Outside clinicians are disabled for now, so they're excluded.
  const billForIds = new Set(
    CLINICIANS.filter((c) => !c.intakeHidden && c.billing !== "biller").map((c) => c.id),
  );

  // A claim moves through three stages, each its own tab:
  //   to bill  = logged, not yet submitted to the insurer (no billed_date)
  //   awaiting = submitted, waiting on the insurer to pay (billed_date, not paid)
  //   paid     = insurer settled (this is COLLECTED money — it feeds payouts)
  const insured = sessions.filter((s) => s.insurerId && insurancePortion(s) > 0 && billForIds.has(s.clinicianId));

  // Self-pay balances behave like a payer: an "owing" visit sits in Awaiting
  // (owed by the client — no insurer to submit to), and moves to Paid once the
  // client clears it. Marking it paid records the fee collected + a paid date.
  const toSelfClaim = (s: (typeof sessions)[number], amount: number): Claim => ({
    id: s.id, dos: s.dateOfService, age: ageDays(s.dateOfService, today),
    clinicianId: s.clinicianId, clinicianName: clinName(s.clinicianId),
    clientId: s.clientId, clientName: `${s.clientFirst} ${s.clientLast}`.trim(),
    insurerId: "self", insurerName: "Self-pay",
    amount: r2(amount), billedDate: null, paid: false, paidDate: s.paidDate,
    commission: 0, afterReferral: false,
  });
  const selfPay = sessions.filter((s) => !s.insurerId && s.selfPayStatus === "owing" && billForIds.has(s.clinicianId));
  const selfOwing = selfPay.filter((s) => selfPayOutstanding(s) > 0).map((s) => toSelfClaim(s, selfPayOutstanding(s)));
  const selfPaidClaims = selfPay.filter((s) => selfPayOutstanding(s) <= 0 && (s.copayCollected || 0) > 0 && s.paidDate).map((s) => toSelfClaim(s, s.totalCost || 0));

  // A settled claim (paid OR written-off / written-down) is off the open list.
  const toBill = insured.filter((s) => !insuranceSettled(s) && !s.billedDate).map(toClaim).sort((a, b) => b.age - a.age);
  const awaiting = insured.filter((s) => !insuranceSettled(s) && !!s.billedDate).map(toClaim).sort((a, b) => b.age - a.age);
  const selfPayClaims = selfOwing.sort((a, b) => b.age - a.age); // self-pay balances owed by clients — their own tab
  // Paid tab shows every settled claim; for a write-off/down the amount is the
  // cash actually collected (not the full billed portion).
  const paid = [...insured.filter(insuranceSettled).map((s) => ({ ...toClaim(s), amount: r2(insuranceCash(s)) })), ...selfPaidClaims].sort((a, b) => (b.paidDate || "").localeCompare(a.paidDate || ""));

  // Everything not yet collected (both open stages) drives the outstanding total
  // and the aging chips.
  const open = [...toBill, ...awaiting, ...selfPayClaims];
  const outstandingTotal = r2(open.reduce((t, c) => t + c.amount, 0));
  const awaitingTotal = r2(awaiting.reduce((t, c) => t + c.amount, 0));
  const paidThisMonthClaims = paid.filter((c) => c.paidDate?.slice(0, 7) === mKey);
  const collectedThisMonth = r2(paidThisMonthClaims.reduce((t, c) => t + c.amount, 0));
  const buckets = AGING_BUCKETS.map((b, i) => {
    const inB = open.filter((c) => agingBucketIndex(c.age) === i);
    return { label: b.label, color: BUCKET_COLORS[i], amount: r2(inB.reduce((t, c) => t + c.amount, 0)), count: inB.length };
  });

  const data: QueueData = {
    toBill, awaiting, selfPay: selfPayClaims, paid,
    commissionThisMonth: r2(paidThisMonthClaims.reduce((t, c) => t + c.commission, 0)),
    waitingCommission: r2(open.reduce((t, c) => t + c.commission, 0)),
    outstandingTotal, awaitingTotal, collectedThisMonth,
    toBillCount: toBill.length,
    awaitingCount: awaiting.length,
    oldestDays: open.length ? Math.max(...open.map((c) => c.age)) : 0,
    buckets,
    // Every practising clinician the biller bills for — listed even with no
    // claims yet, so Sofia is selectable before her first one.
    clinicians: CLINICIANS.filter((c) => !c.intakeHidden && c.billing !== "biller").map((c) => ({ id: c.id, name: c.name })),
    today,
  };

  return <BillingQueueClient data={data} />;
}
