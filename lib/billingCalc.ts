// =============================================================================
// TIFEC Billing - money model (pure functions, no DB). Easy to reason about + test.
//
// Vocabulary (confirmed with the practice):
//   • A session has a fee (totalCost). If its insurer requires a co-pay, the client
//     pays that at the visit (collected immediately); the rest is the INSURANCE
//     PORTION. Self-pay sessions (no insurer) are fully collected at the visit.
//   • BILLED = the biller has confirmed insurance PAID the insurance portion. There
//     are two states only: outstanding -> billed. (Stored as insurancePaid/paidDate.)
//   • COLLECTED this month = co-pays from this month's visits + insurance portions
//     billed this month (a payment can roll over from an earlier month's visit).
//   • Clinician PAYOUT = 60% of what they collected this month, minus a fixed health
//     deduction. The company keeps 40% + deductions. (retentionPct default 40.)
// =============================================================================

import type { BillingSession, ClinicianBillingSettings } from "./billing";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
const inMonth = (dateStr: string | null, y: number, m: number) => !!dateStr && dateStr.slice(0, 7) === monthKey(y, m);

/** Part of a session's fee that goes through insurance (0 for self-pay). */
export function insurancePortion(s: BillingSession): number {
  if (!s.insurerId) return 0;
  return round2(Math.max(0, (s.totalCost || 0) - (s.copayCollected || 0)));
}
/** Part collected at the visit: the co-pay, or the whole fee if self-pay. */
export function collectedAtVisit(s: BillingSession): number {
  if (!s.insurerId) return round2(s.totalCost || 0);
  return round2(s.copayCollected || 0);
}

const sumBy = (arr: BillingSession[], f: (s: BillingSession) => number) => round2(arr.reduce((t, s) => t + f(s), 0));

export interface ClinicianMonth {
  clinicianId: string;
  year: number;
  month: number;
  // this month's work ("money coming")
  appointments: number;
  revenueGenerated: number;      // Σ fee of visits this month
  copayThisMonth: number;        // co-pays collected at those visits
  billedFromThisMonth: number;   // fee of this month's visits already billed (cohort)
  outstandingThisMonth: number;  // insurance portion of this month's visits not yet billed
  // cashflow ("money actually in this month" — drives payout)
  insuranceBilledThisMonth: number; // insurance portions billed this month (any visit month)
  collected: number;                // copayThisMonth + insuranceBilledThisMonth
  // running
  outstanding: number;              // insurance portion of ALL un-billed sessions
  // payout breakdown (on collected)
  retentionPct: number;
  retentionAmount: number;
  otherDeductionPct: number;
  otherDeductionPctAmount: number;
  healthDeduction: number;          // fixed KYD (settings.otherDeductionFixed)
  payout: number;
  companyKeeps: number;
  // supporting lists
  visitSessions: BillingSession[];
  outstandingSessions: BillingSession[];
}

export function computeClinicianMonth(
  sessions: BillingSession[],
  settings: ClinicianBillingSettings,
  year: number,
  month: number
): ClinicianMonth {
  const visits = sessions.filter((s) => inMonth(s.dateOfService, year, month));
  const billedThisMonth = sessions.filter((s) => s.insurancePaid && inMonth(s.paidDate, year, month));
  const unbilled = sessions.filter((s) => s.insurerId && !s.insurancePaid);
  const visitsBilled = visits.filter((s) => s.insurancePaid);
  const visitsUnbilled = visits.filter((s) => s.insurerId && !s.insurancePaid);

  const revenueGenerated = sumBy(visits, (s) => s.totalCost || 0);
  const copayThisMonth = sumBy(visits, collectedAtVisit);
  const insuranceBilledThisMonth = sumBy(billedThisMonth, insurancePortion);
  const collected = round2(copayThisMonth + insuranceBilledThisMonth);

  const pct = settings.retentionPct;
  const retentionAmount = round2((collected * pct) / 100);
  const otherPctAmount = round2((collected * settings.otherDeductionPct) / 100);
  const health = settings.otherDeductionFixed;
  const payout = round2(collected - retentionAmount - otherPctAmount - health);

  return {
    clinicianId: settings.clinicianId,
    year,
    month,
    appointments: visits.length,
    revenueGenerated,
    copayThisMonth,
    billedFromThisMonth: sumBy(visitsBilled, (s) => s.totalCost || 0),
    outstandingThisMonth: sumBy(visitsUnbilled, insurancePortion),
    insuranceBilledThisMonth,
    collected,
    outstanding: sumBy(unbilled, insurancePortion),
    retentionPct: pct,
    retentionAmount,
    otherDeductionPct: settings.otherDeductionPct,
    otherDeductionPctAmount: otherPctAmount,
    healthDeduction: health,
    payout,
    companyKeeps: round2(retentionAmount + otherPctAmount + health),
    visitSessions: visits,
    outstandingSessions: unbilled,
  };
}

export interface BusinessMonth {
  year: number;
  month: number;
  appointments: number;
  revenueGenerated: number;   // total "coming in" for this month's work
  collected: number;          // total money actually in this month
  billed: number;             // insurance confirmed paid this month
  copays: number;             // co-pays collected this month
  outstanding: number;        // total not yet paid by insurance (running)
  totalPayout: number;        // sum of clinician payouts
  companyNet: number;         // collected - payouts (what the business keeps)
  perClinician: ClinicianMonth[];
}

/** Roll up per-clinician results into the whole-business picture. */
export function computeBusinessMonth(perClinician: ClinicianMonth[], year: number, month: number): BusinessMonth {
  const s = (f: (c: ClinicianMonth) => number) => round2(perClinician.reduce((t, c) => t + f(c), 0));
  const collected = s((c) => c.collected);
  const totalPayout = s((c) => c.payout);
  return {
    year,
    month,
    appointments: perClinician.reduce((t, c) => t + c.appointments, 0),
    revenueGenerated: s((c) => c.revenueGenerated),
    collected,
    billed: s((c) => c.insuranceBilledThisMonth),
    copays: s((c) => c.copayThisMonth),
    outstanding: s((c) => c.outstanding),
    totalPayout,
    companyNet: round2(collected - totalPayout),
    perClinician,
  };
}

// ---- The bottom line: collected → −payouts − biller 3% − expenses = net ----------
export interface BottomLine {
  cashCollected: number;
  payouts: number;
  billerCommission: number;
  billerCommissionPct: number;
  runningExpenses: number;
  net: number;
  outstanding: number;
  projectedNet: number; // net + what the practice keeps once outstanding lands (~37%)
}

export function computeBottomLine(biz: BusinessMonth, billerCommissionPct: number, runningExpensesTotal: number): BottomLine {
  const billerCommission = round2((biz.billed * billerCommissionPct) / 100);
  const net = round2(biz.collected - biz.totalPayout - billerCommission - runningExpensesTotal);
  // Once an outstanding claim is paid: 60% goes to the clinician, biller% off insurance,
  // the rest (~37%) stays with the practice. Show the owner the swing.
  const keepRate = Math.max(0, 100 - 60 - billerCommissionPct) / 100;
  return {
    cashCollected: biz.collected,
    payouts: biz.totalPayout,
    billerCommission,
    billerCommissionPct,
    runningExpenses: runningExpensesTotal,
    net,
    outstanding: biz.outstanding,
    projectedNet: round2(net + biz.outstanding * keepRate),
  };
}

// ---- Claim aging (days since the visit) ------------------------------------------
export function ageDays(dateOfService: string, todayISO: string): number {
  const a = Date.parse(dateOfService + "T00:00:00Z");
  const b = Date.parse(todayISO + "T00:00:00Z");
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

export const AGING_BUCKETS = [
  { key: "0-14", label: "0–14 days", min: 0, max: 14 },
  { key: "15-30", label: "15–30 days", min: 15, max: 30 },
  { key: "31-60", label: "31–60 days", min: 31, max: 60 },
  { key: "60+", label: "60+ days", min: 61, max: Infinity },
] as const;

export function agingBucketIndex(days: number): number {
  return AGING_BUCKETS.findIndex((b) => days >= b.min && days <= b.max);
}

/** Auto-suggest the co-pay for a session from the insurer's rule. Editable by the clinician. */
export function suggestCopay(insurer: { copayType: "none" | "fixed" | "percentage"; copayRate: number } | null | undefined, totalCost: number): number {
  if (!insurer) return 0;
  if (insurer.copayType === "fixed") return round2(insurer.copayRate);
  if (insurer.copayType === "percentage") return round2((totalCost * insurer.copayRate) / 100);
  return 0;
}
