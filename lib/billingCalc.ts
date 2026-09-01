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

// Default pension rate: a % of what a clinician keeps AFTER the company's
// retention cut — a dynamic figure, never a flat amount. The owner/admin can
// override this per clinician in Setup (settings.pensionPct).
export const PENSION_PCT = 10;

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
/** Cash actually collected for this visit: the co-pay (insured), or for self-pay
 *  the amount paid. Self-pay disposition: undefined/"paid" = paid in full at the
 *  visit (default, so legacy self-pay is unchanged); "owing" = only copayCollected
 *  has come in so far; "waived" = written off, nothing collected. */
export function collectedAtVisit(s: BillingSession): number {
  if (!s.insurerId) {
    if (s.selfPayStatus === "waived") return 0;
    if (s.selfPayStatus === "owing") return round2(Math.min(s.totalCost || 0, s.copayCollected || 0));
    return round2(s.totalCost || 0);
  }
  return round2(s.copayCollected || 0);
}
/** For a self-pay visit still owing, how much the client has yet to pay (fee minus
 *  what's collected). 0 for insured, paid-in-full, or waived self-pay. */
export function selfPayOutstanding(s: BillingSession): number {
  if (s.insurerId || s.selfPayStatus !== "owing") return 0;
  return round2(Math.max(0, (s.totalCost || 0) - (s.copayCollected || 0)));
}
/** The fee written off on a waived self-pay visit (0 otherwise). */
export function selfPayWaived(s: BillingSession): number {
  return !s.insurerId && s.selfPayStatus === "waived" ? round2(s.totalCost || 0) : 0;
}
/** Co-pay DUE but not collected AND still owed (the biller should invoice it).
 *  A waived co-pay is excluded — that's forgiven, not owed. Insured visits only. */
export function uncollectedCopay(s: BillingSession): number {
  if (!s.insurerId || s.selfPayStatus === "waived") return 0;
  const due = s.copayDue == null ? s.copayCollected : s.copayDue;
  return round2(Math.max(0, (due || 0) - (s.copayCollected || 0)));
}
/** Co-pay that was DUE but deliberately WAIVED (written off, never chased). */
export function waivedCopay(s: BillingSession): number {
  if (!s.insurerId || s.selfPayStatus !== "waived") return 0;
  const due = s.copayDue == null ? s.copayCollected : s.copayDue;
  return round2(Math.max(0, (due || 0) - (s.copayCollected || 0)));
}
/** A claim is settled (off the outstanding list) when it's paid OR adjusted with
 *  a contractual write-off / write-down. */
export function insuranceSettled(s: BillingSession): boolean {
  return !!s.insurerId && (s.insurancePaid || !!s.insuranceDisposition);
}
/** Cash actually collected from the insurer on this claim: the whole billed
 *  portion if paid in full, the allowed amount on a write-off/write-down, else 0. */
export function insuranceCash(s: BillingSession): number {
  if (!s.insurerId) return 0;
  if (s.insuranceDisposition) return round2(Math.max(0, s.insuranceCollected ?? 0));
  return s.insurancePaid ? insurancePortion(s) : 0;
}
/** The contractual write-off on a claim (billed portion minus what was collected). */
export function contractualWriteoff(s: BillingSession): number {
  if (!s.insurerId || s.insuranceDisposition !== "writeoff") return 0;
  return round2(Math.max(0, insurancePortion(s) - (s.insuranceCollected ?? 0)));
}
/** The write-down on a claim (billed portion minus what was collected). */
export function writeDown(s: BillingSession): number {
  if (!s.insurerId || s.insuranceDisposition !== "writedown") return 0;
  return round2(Math.max(0, insurancePortion(s) - (s.insuranceCollected ?? 0)));
}

const sumBy = (arr: BillingSession[], f: (s: BillingSession) => number) => round2(arr.reduce((t, s) => t + f(s), 0));

/** Practice-wide cash collected in a given month, bucketed by when it actually
 *  came in: an insured co-pay by its copayPaidDate (defaults to the visit),
 *  self-pay by its paid date, and insurance by its paidDate. This is exactly
 *  computeClinicianMonth's `collected`, summed across everyone — and because it's
 *  session-additive it needs no per-clinician settings. */
export function collectedInMonth(sessions: BillingSession[], year: number, month: number): number {
  let total = 0;
  for (const s of sessions) {
    if (s.insurerId) {
      if ((s.copayCollected || 0) > 0 && inMonth(s.copayPaidDate || s.dateOfService, year, month)) total += round2(s.copayCollected || 0);
      if (insuranceSettled(s) && inMonth(s.paidDate, year, month)) total += insuranceCash(s);
    } else if (inMonth(s.paidDate || s.dateOfService, year, month)) {
      total += collectedAtVisit(s);
    }
  }
  return round2(total);
}

// One insurance payment that landed this month, tagged by whether it paid for a
// visit in this month or an earlier one. Names are resolved in the UI layer.
export interface InsuranceCollectedItem {
  sessionId: string;
  clientId: string | null;
  dateOfService: string;
  paidDate: string | null;
  insurerId: string | null;
  amount: number;
  fromThisMonth: boolean;
}

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
  uncollectedCopay: number;      // co-pay due at this month's visits, not collected, still OWED (invoice)
  waivedCopay: number;           // co-pay due at this month's visits, deliberately WAIVED (written off)
  // cashflow ("money actually in this month" — drives payout)
  insuranceBilledThisMonth: number; // insurance cash collected this month (any visit month)
  insuranceThisMonthVisits: number; // of that, the part for THIS month's visits
  insurancePriorVisits: number;     // of that, the part for EARLIER months' visits (the lag)
  insuranceCollectedItems: InsuranceCollectedItem[]; // per-payment detail for the breakdown
  contractualWriteoff: number;      // billed amount written off (contractual) this month
  writeDown: number;                // billed amount written down this month
  collected: number;                // copayThisMonth + insuranceBilledThisMonth
  // running
  outstanding: number;              // insurance portion of ALL un-billed sessions
  // payout breakdown (on collected)
  retentionPct: number;
  retentionAmount: number;
  otherDeductionPct: number;
  otherDeductionPctAmount: number;
  healthDeduction: number;          // fixed KYD (settings.otherDeductionFixed)
  pension: number;                  // pensionPct% of the after-retention share (dynamic)
  pensionPct: number;               // the pension rate applied (editable, default 10)
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
  // Settled this month = paid or adjusted (write-off / write-down) this month.
  const billedThisMonth = sessions.filter((s) => insuranceSettled(s) && inMonth(s.paidDate, year, month));
  // Outstanding = insured, not yet settled (adjusted claims are settled, not owed).
  const unbilled = sessions.filter((s) => s.insurerId && !insuranceSettled(s));
  const visitsBilled = visits.filter((s) => insuranceSettled(s));
  const visitsUnbilled = visits.filter((s) => s.insurerId && !insuranceSettled(s));

  // Realizable production: the value of this month's visits LESS anything written
  // off (contractual) or written down (uncollectable). A written-off/down amount
  // is never revenue for the clinician, so it never counts as earned.
  const revenueGenerated = sumBy(visits, (s) => (s.totalCost || 0) - contractualWriteoff(s) - writeDown(s));
  // A co-pay counts when it actually CAME IN — its copayPaidDate (which defaults
  // to the visit date for copays taken at the visit, so the common case is
  // unchanged). A copay collected late books to the month it arrived, like
  // self-pay. Self-pay likewise counts on its paid date (or the visit if paid then).
  const insuredCopaySessions = sessions.filter((s) => s.insurerId && (s.copayCollected || 0) > 0 && inMonth(s.copayPaidDate || s.dateOfService, year, month));
  const insuredCopay = sumBy(insuredCopaySessions, (s) => round2(s.copayCollected || 0));
  const selfPayCollectedSessions = sessions.filter((s) => !s.insurerId && inMonth(s.paidDate || s.dateOfService, year, month));
  const selfPayCollected = sumBy(selfPayCollectedSessions, collectedAtVisit);
  const copayThisMonth = round2(insuredCopay + selfPayCollected);
  // Collected insurance = the actual cash (full portion when paid; the allowed
  // amount on a write-off / write-down). The rest is the adjustment, tracked in
  // its own buckets below — never counted as collected, so it never pays out.
  const insuranceBilledThisMonth = sumBy(billedThisMonth, insuranceCash);
  // Break the insurance cash down by WHICH visit it paid for: money for a visit
  // in this same month, versus money that landed now for an older visit (the
  // insurance lag). The itemised list backs an expandable breakdown in the UI.
  const insuranceThisMonthVisits = sumBy(billedThisMonth.filter((s) => inMonth(s.dateOfService, year, month)), insuranceCash);
  const insurancePriorVisits = round2(insuranceBilledThisMonth - insuranceThisMonthVisits);
  const insuranceCollectedItems: InsuranceCollectedItem[] = billedThisMonth
    .map((s) => ({ sessionId: s.id, clientId: s.clientId, dateOfService: s.dateOfService, paidDate: s.paidDate ?? null, insurerId: s.insurerId ?? null, amount: insuranceCash(s), fromThisMonth: inMonth(s.dateOfService, year, month) }))
    .filter((it) => it.amount > 0)
    .sort((a, b) => (a.paidDate || "").localeCompare(b.paidDate || "") || (a.dateOfService || "").localeCompare(b.dateOfService || ""));
  const contractualWriteoffThisMonth = sumBy(billedThisMonth, contractualWriteoff);
  const writeDownThisMonth = sumBy(billedThisMonth, writeDown);
  const collected = round2(copayThisMonth + insuranceBilledThisMonth);

  // An owner who draws no payout: their collections stay with the practice, with
  // no retention split or deductions applied. Their production still computes.
  const noPayout = settings.noPayout ?? false;
  const pct = noPayout ? 0 : settings.retentionPct;
  const retentionAmount = noPayout ? 0 : round2((collected * pct) / 100);
  const otherPctAmount = noPayout ? 0 : round2((collected * settings.otherDeductionPct) / 100);
  const health = noPayout ? 0 : settings.otherDeductionFixed;
  // Pension = a % of the clinician's after-retention share (what they keep once
  // the company has taken its retention %). The rate is editable per clinician by
  // the owner/admin and defaults to 10; the legacy flat settings.pension is unused.
  const afterRetentionShare = round2(collected - retentionAmount);
  const pensionPct = settings.pensionPct ?? PENSION_PCT;
  const pension = noPayout ? 0 : round2((afterRetentionShare * pensionPct) / 100);
  // The biller has two SEPARATE agreements, and they are paid by different
  // parties — this is the whole point, so keep them apart:
  //   1. with the clinician — their own rate, out of their share, and
  //   2. with the practice — a % of the company retention, out of the company's.
  // Both are charged on insurance collected (what the biller chases); co-pays
  // are taken at the visit by the clinician.
  const billerPct = settings.billerPct ?? 0;
  // Policy: the biller's rate is charged on the clinician's after-retention share
  // of the insurance — (100 − retention)% of insurance billed. A clinician can
  // carry a per-clinician base OVERRIDE (billerBasePct in Setup) for a private
  // biller↔clinician agreement that differs from the standard rule — e.g. Joan,
  // whose biller takes 7% of 70% of insurance even though her retention implies a
  // different share. A stored 0 (or unset) means "no override, use the rule."
  const billerBasePct = settings.billerBasePct && settings.billerBasePct > 0
    ? settings.billerBasePct
    : Math.max(0, 100 - pct);
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
    billedFromThisMonth: sumBy(visitsBilled, (s) => (s.totalCost || 0) - contractualWriteoff(s) - writeDown(s)),
    outstandingThisMonth: sumBy(visitsUnbilled, insurancePortion),
    uncollectedCopay: sumBy(visits, uncollectedCopay),
    waivedCopay: sumBy(visits, waivedCopay),
    insuranceBilledThisMonth,
    insuranceThisMonthVisits,
    insurancePriorVisits,
    insuranceCollectedItems,
    contractualWriteoff: contractualWriteoffThisMonth,
    writeDown: writeDownThisMonth,
    collected,
    outstanding: sumBy(unbilled, insurancePortion),
    retentionPct: pct,
    retentionAmount,
    otherDeductionPct: settings.otherDeductionPct,
    otherDeductionPctAmount: otherPctAmount,
    healthDeduction: health,
    pension,
    pensionPct,
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
  uncollectedCopay: number;   // co-pay due this month, not collected, still owed (invoice)
  waivedCopay: number;        // co-pay due this month, deliberately waived (written off)
  contractualWriteoff: number; // insurance billed written off (contractual) this month
  writeDown: number;          // insurance billed written down this month
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
    waivedCopay: s((c) => c.waivedCopay),
    contractualWriteoff: s((c) => c.contractualWriteoff),
    writeDown: s((c) => c.writeDown),
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
