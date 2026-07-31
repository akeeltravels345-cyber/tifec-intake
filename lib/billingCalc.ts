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

/** Part of a session's fee that goes through insurance (0 for self-pay). The
 *  insurer owes the fee less the patient's CONTRACTED co-pay (copayDue), never
 *  less what was actually collected — an uncollected co-pay is the practice's
 *  loss (see uncollectedCopay), not extra insurance revenue. */
export function insurancePortion(s: BillingSession): number {
  if (!s.insurerId) return 0;
  const due = s.copayDue == null ? s.copayCollected : s.copayDue;
  return round2(Math.max(0, (s.totalCost || 0) - (due || 0)));
}
/** Part collected at the visit: the co-pay, or the whole fee if self-pay. */
export function collectedAtVisit(s: BillingSession): number {
  if (!s.insurerId) return round2(s.totalCost || 0);
  return round2(s.copayCollected || 0);
}
/** Co-pay that was DUE but not collected (written off) — insured visits only. */
export function uncollectedCopay(s: BillingSession): number {
  if (!s.insurerId) return 0;
  const due = s.copayDue == null ? s.copayCollected : s.copayDue;
  return round2(Math.max(0, (due || 0) - (s.copayCollected || 0)));
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
  uncollectedCopay: number;      // co-pay that was due at this month's visits but not collected
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
  pension: number;                  // fixed KYD pension deduction
  payout: number;
  noPayout: boolean;                // owner draws nothing; collections stay with the practice
  companyKeeps: number;
  // The biller has TWO separate agreements, paid by two different parties:
  billerPct: number;              // the clinician's own rate with the biller
  billerBasePct: number;          // the share of billed income that rate is charged on
  billerFromClinician: number;    // deducted from THIS clinician's payout
  billerFromCompany: number;      // paid by the practice out of its retention
  billerCommission: number;       // both together — what the biller earns here
  // supporting lists
  visitSessions: BillingSession[];
  outstandingSessions: BillingSession[];
}

export function computeClinicianMonth(
  sessions: BillingSession[],
  settings: ClinicianBillingSettings,
  year: number,
  month: number,
  /** Practice-wide biller rate, taken as a % of the COMPANY RETENTION on this
   *  clinician (not of their collections, and never out of their payout). */
  billerCommissionPct = 0
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

  // An owner who draws no payout: their collections stay with the practice, with
  // no retention split or deductions applied. Their production still computes.
  const noPayout = settings.noPayout ?? false;
  const pct = noPayout ? 0 : settings.retentionPct;
  const retentionAmount = noPayout ? 0 : round2((collected * pct) / 100);
  const otherPctAmount = noPayout ? 0 : round2((collected * settings.otherDeductionPct) / 100);
  const health = noPayout ? 0 : settings.otherDeductionFixed;
  const pension = noPayout ? 0 : (settings.pension ?? 0);
  // The biller has two SEPARATE agreements, and they are paid by different
  // parties — this is the whole point, so keep them apart:
  //   1. with the clinician — their own rate, out of their share, and
  //   2. with the practice — a % of the company retention, out of the company's.
  // Both are charged on insurance collected (what the biller chases); co-pays
  // are taken at the visit by the clinician.
  const billerPct = settings.billerPct ?? 0;
  // The biller's % is charged on only a SHARE of the clinician's insurance billed
  // (default 100%). A lower base means more of their billed income is theirs, free
  // of the biller's cut — e.g. Nick bills Joan on 70% of hers, not all of it.
  const billerBasePct = settings.billerBasePct ?? 100;
  const billerBase = round2((insuranceBilledThisMonth * billerBasePct) / 100);
  const billerFromClinician = round2((billerBase * billerPct) / 100);
  const insuranceRetention = round2((insuranceBilledThisMonth * pct) / 100);
  // The practice-wide biller commission (the 3% of company retention) is only
  // agreed for select clinicians — it applies only when this clinician's setting
  // opts in. Everyone else contributes nothing to the company-paid biller share.
  const companyCommissionPct = settings.billerCommissionApplies ? billerCommissionPct : 0;
  const billerFromCompany = round2((insuranceRetention * companyCommissionPct) / 100);
  const billerCommission = round2(billerFromCompany + billerFromClinician);

  // The clinician's own agreement is settled out of their share, so it reduces
  // their payout. The company's agreement never does. An owner who draws nothing
  // has a payout of 0 — all collected stays with the practice.
  const payout = noPayout ? 0 : round2(collected - retentionAmount - otherPctAmount - health - pension - billerFromClinician);

  return {
    clinicianId: settings.clinicianId,
    year,
    month,
    appointments: visits.length,
    revenueGenerated,
    copayThisMonth,
    billedFromThisMonth: sumBy(visitsBilled, (s) => s.totalCost || 0),
    outstandingThisMonth: sumBy(visitsUnbilled, insurancePortion),
    uncollectedCopay: sumBy(visits, uncollectedCopay),
    insuranceBilledThisMonth,
    collected,
    outstanding: sumBy(unbilled, insurancePortion),
    retentionPct: pct,
    retentionAmount,
    otherDeductionPct: settings.otherDeductionPct,
    otherDeductionPctAmount: otherPctAmount,
    healthDeduction: health,
    pension,
    payout,
    noPayout,
    companyKeeps: noPayout ? round2(collected - billerFromClinician) : round2(retentionAmount + otherPctAmount + health + pension),
    billerPct,
    billerBasePct,
    billerFromClinician,
    billerFromCompany,
    billerCommission,
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
  uncollectedCopay: number;   // co-pay due at this month's visits but not collected
  outstanding: number;        // total not yet paid by insurance (running)
  totalPayout: number;        // sum of clinician payouts
  billerCommission: number;   // total the biller earns across the practice
  billerFromClinicians: number; // withheld from clinician payouts and passed on
  billerFromCompany: number;    // the practice's own agreement with the biller
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
    uncollectedCopay: s((c) => c.uncollectedCopay),
    outstanding: s((c) => c.outstanding),
    totalPayout,
    billerCommission: s((c) => c.billerCommission),
    billerFromClinicians: s((c) => c.billerFromClinician),
    billerFromCompany: s((c) => c.billerFromCompany),
    companyNet: round2(collected - totalPayout),
    perClinician,
  };
}

// ---- The bottom line: collected → −payouts − biller 3% − expenses = net ----------
export interface BottomLine {
  cashCollected: number;
  payouts: number;
  billerCommission: number;
  billerFromClinicians: number;
  billerFromCompany: number;
  billerCommissionPct: number;
  runningExpenses: number;
  net: number;
  outstanding: number;
  projectedNet: number; // net + what the practice keeps once outstanding lands (~37%)
  // Builder's platform fee — % of total cash collected. Kept OUT of `net` (the
  // practice's operating net) and surfaced only to the admin/builder.
  processingFee: number;
  processingFeePct: number;
  netAfterProcessing: number;
}

export function computeBottomLine(biz: BusinessMonth, runningExpensesTotal: number, processingFeePct = 0): BottomLine {
  const billerCommission = biz.billerCommission; // per-clinician, already summed
  const net = round2(biz.collected - biz.totalPayout - billerCommission - runningExpensesTotal);
  const processingFee = round2((biz.collected * processingFeePct) / 100);
  // Blended biller rate (varies by clinician) for the projected-net estimate. Once an
  // outstanding claim is paid: 60% to the clinician, ~blended% to the biller, rest kept.
  const effBillerPct = biz.billed > 0 ? (billerCommission / biz.billed) * 100 : 8.5;
  const keepRate = Math.max(0, 100 - 60 - effBillerPct) / 100;
  return {
    cashCollected: biz.collected,
    payouts: biz.totalPayout,
    billerCommission,
    billerFromClinicians: biz.billerFromClinicians,
    billerFromCompany: biz.billerFromCompany,
    billerCommissionPct: Math.round(effBillerPct * 10) / 10,
    runningExpenses: runningExpensesTotal,
    net,
    outstanding: biz.outstanding,
    projectedNet: round2(net + biz.outstanding * keepRate),
    processingFee,
    processingFeePct,
    netAfterProcessing: round2(net - processingFee),
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
