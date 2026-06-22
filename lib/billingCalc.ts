// =============================================================================
// TIFEC Billing - pure calculation helpers (no DB). Easy to unit-test.
// =============================================================================

import type { BillingSession, ClinicianBillingSettings, Insurer } from "./billing";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
const inMonth = (dateStr: string | null, y: number, m: number) => !!dateStr && dateStr.slice(0, 7) === monthKey(y, m);

/** Auto-suggest the co-pay for a session from the insurer's rule. Editable by the clinician. */
export function suggestCopay(insurer: Insurer | null | undefined, totalCost: number): number {
  if (!insurer) return 0;
  if (insurer.copayType === "fixed") return round2(insurer.copayRate);
  if (insurer.copayType === "percentage") return round2((totalCost * insurer.copayRate) / 100);
  return 0;
}

export interface MonthlyDisbursement {
  clinicianId: string;
  year: number;
  month: number;
  // headline figures
  billedThisMonth: number; // sessions whose date_of_service is in this month (regardless of paid)
  paidThisMonthBilledThisMonth: number; // billed in M AND insurance paid in M
  rolledOverPaidThisMonth: number; // billed in a prior month, insurance paid in M
  payrollEligibleRevenue: number; // = above two (everything paid in M)
  outstanding: number; // ALL unpaid sessions, running total, any month
  // payout breakdown
  retentionPct: number;
  retentionAmount: number;
  otherDeductionPct: number;
  otherDeductionPctAmount: number;
  otherDeductionFixed: number;
  netPayout: number;
  // supporting lists
  paidThisMonthSessions: BillingSession[];
  outstandingSessions: BillingSession[];
}

const sum = (arr: BillingSession[]) => round2(arr.reduce((t, s) => t + (s.totalCost || 0), 0));

/**
 * Disbursement for one clinician for one month.
 * Payroll follows the rollover rule: a session counts toward the month its
 * insurance was PAID (paid_date), not when it was billed. Unpaid sessions show
 * as Outstanding every month until a biller marks them paid.
 */
export function computeDisbursement(
  sessions: BillingSession[],
  settings: ClinicianBillingSettings,
  year: number,
  month: number
): MonthlyDisbursement {
  const billed = sessions.filter((s) => inMonth(s.dateOfService, year, month));
  const paidThisMonth = sessions.filter((s) => s.insurancePaid && inMonth(s.paidDate, year, month));
  const confirmedSameMonth = paidThisMonth.filter((s) => inMonth(s.dateOfService, year, month));
  const rolledOver = paidThisMonth.filter((s) => !inMonth(s.dateOfService, year, month));
  const outstandingSessions = sessions.filter((s) => !s.insurancePaid);

  const payrollEligibleRevenue = sum(paidThisMonth);
  const retentionAmount = round2((payrollEligibleRevenue * settings.retentionPct) / 100);
  const otherDeductionPctAmount = round2((payrollEligibleRevenue * settings.otherDeductionPct) / 100);
  const netPayout = round2(payrollEligibleRevenue - retentionAmount - otherDeductionPctAmount - settings.otherDeductionFixed);

  return {
    clinicianId: settings.clinicianId,
    year,
    month,
    billedThisMonth: sum(billed),
    paidThisMonthBilledThisMonth: sum(confirmedSameMonth),
    rolledOverPaidThisMonth: sum(rolledOver),
    payrollEligibleRevenue,
    outstanding: sum(outstandingSessions),
    retentionPct: settings.retentionPct,
    retentionAmount,
    otherDeductionPct: settings.otherDeductionPct,
    otherDeductionPctAmount,
    otherDeductionFixed: settings.otherDeductionFixed,
    netPayout,
    paidThisMonthSessions: paidThisMonth,
    outstandingSessions,
  };
}
