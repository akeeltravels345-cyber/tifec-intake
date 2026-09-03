// The biller's commission for a month, in one place so the biller dashboard and
// the biller payout statement can never disagree on the money.
//
// TIFEC clinicians pay the biller two ways, both out of the company's share: a
// practice-wide % of the COMPANY RETENTION, plus an individual % agreed for that
// clinician. Outside clinicians just carry their own rate on what's collected.
// Commission is earned only on real (non-hidden) clinicians and outside clients.

import { insurancePortion } from "./billingCalc";
import { CLINICIANS } from "./clinicians";
import type { BillingSession, ClinicianBillingSettings, ExternalClinician } from "./billing";

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface BillerClinicianRow {
  id: string; name: string; external: boolean; pct: number; claims: number;
  collected: number; base: number; cut: number; pending: number; outstanding: number;
}
export interface BillerCompanyRow { retained: number; cut: number; pending: number; claims: number; }

export interface BillerMonth {
  billerRate: number;              // practice-wide % of company retention
  insuranceCollected: number;      // insurance cash collected this month
  billedCount: number;             // how many paid claims made up that collection
  commission: number;              // the biller's cut of what was COLLECTED (= payout)
  pendingCommission: number;       // their cut still to come on open claims
  blendedRate: string;             // commission / collected, as a % string
  byClinician: BillerClinicianRow[]; // each clinician's own-rate cut
  company: BillerCompanyRow;         // the company-retention 3% cut, as its own line
  // Per-session commission (for callers that aggregate their own way, e.g. by insurer).
  comm: (s: BillingSession) => number;
}

/** Build the per-session commission functions for a given settings snapshot. */
export function billerCommissionFns(settingsList: ClinicianBillingSettings[], external: ExternalClinician[], billerRate: number) {
  const settingsOf = (cid: string) => settingsList.find((s) => s.clinicianId === cid);
  const retentionPctOf = (cid: string) => settingsOf(cid)?.retentionPct ?? 0;
  const directPctOf = (cid: string) => settingsOf(cid)?.billerPct ?? 0;
  // The practice-wide % of company retention is earned ONLY for clinicians whose
  // Setup has "biller commission applies" turned on — same rule as the clinician
  // payout calc. Without this, the company cut would be paid where it shouldn't.
  const commAppliesOf = (cid: string) => !!settingsOf(cid)?.billerCommissionApplies;
  const externalOf = (cid: string) => external.find((c) => c.id === cid);
  const earnsCommission = (cid: string) => !!externalOf(cid) || CLINICIANS.some((c) => c.id === cid && !c.intakeHidden);

  const retentionBaseOf = (s: BillingSession) =>
    !earnsCommission(s.clinicianId) || externalOf(s.clinicianId) || !commAppliesOf(s.clinicianId) ? 0 : (insurancePortion(s) * retentionPctOf(s.clinicianId)) / 100;
  const companyOf = (s: BillingSession) => (retentionBaseOf(s) * billerRate) / 100;
  // The share of the insurance the biller's OWN rate is charged on: the
  // clinician's after-retention portion (100 - retention), or their stored
  // per-clinician base override (e.g. Joan). Matches the clinician payout calc,
  // so the biller's cut equals what's actually deducted from the clinician.
  const billerBasePctOf = (cid: string) => {
    const b = settingsOf(cid)?.billerBasePct;
    return b && b > 0 ? b : Math.max(0, 100 - retentionPctOf(cid));
  };
  const clinicianBaseOf = (s: BillingSession) => {
    if (!earnsCommission(s.clinicianId)) return 0;
    const ins = insurancePortion(s);
    // Outside clients carry the biller's rate on the whole collected amount.
    return externalOf(s.clinicianId) ? ins : (ins * billerBasePctOf(s.clinicianId)) / 100;
  };
  const directOf = (s: BillingSession) => {
    const e = externalOf(s.clinicianId);
    const rate = e ? e.billerPct : directPctOf(s.clinicianId);
    return (clinicianBaseOf(s) * rate) / 100;
  };
  const comm = (s: BillingSession) => directOf(s) + companyOf(s);
  return { retentionPctOf, directPctOf, externalOf, earnsCommission, retentionBaseOf, companyOf, directOf, comm, clinicianBaseOf };
}

/** The biller's commission position for one month: collected (= payout), pending,
 *  and the per-clinician / company breakdown that sums to the collected total. */
export function computeBillerMonth(
  all: BillingSession[],
  settingsList: ClinicianBillingSettings[],
  external: ExternalClinician[],
  billerRate: number,
  year: number,
  month: number,
): BillerMonth {
  const mKey = `${year}-${String(month).padStart(2, "0")}`;
  const fns = billerCommissionFns(settingsList, external, billerRate);
  const sum = (arr: BillingSession[], f: (s: BillingSession) => number) => r2(arr.reduce((t, s) => t + f(s), 0));

  const billedThisMonth = all.filter((s) => s.insurancePaid && s.paidDate?.slice(0, 7) === mKey && insurancePortion(s) > 0);
  const unbilled = all.filter((s) => s.insurerId && !s.insurancePaid && insurancePortion(s) > 0);

  const insuranceCollected = sum(billedThisMonth, insurancePortion);

  const roster = CLINICIANS.filter((c) => !c.intakeHidden && c.billing !== "biller");
  const byClinician: BillerClinicianRow[] = roster.map((c) => {
    const billed = billedThisMonth.filter((s) => s.clinicianId === c.id);
    const open = unbilled.filter((s) => s.clinicianId === c.id);
    return {
      id: c.id, name: c.name, external: false, pct: fns.directPctOf(c.id), claims: billed.length,
      collected: sum(billed, insurancePortion), base: sum(billed, fns.clinicianBaseOf), cut: sum(billed, fns.directOf),
      pending: sum(open, fns.directOf), outstanding: sum(open, insurancePortion),
    };
  }).filter((c) => c.collected > 0 || c.outstanding > 0).sort((a, b) => b.cut - a.cut);

  const company: BillerCompanyRow = {
    retained: sum(billedThisMonth, fns.retentionBaseOf),
    cut: sum(billedThisMonth, fns.companyOf),
    pending: sum(unbilled, fns.companyOf),
    claims: billedThisMonth.filter((s) => fns.companyOf(s) > 0).length,
  };

  // Derive the headline totals from the already-rounded breakdown rows, so the
  // statement and dashboard always reconcile to the penny (summing per-session
  // then rounding can differ from the sum of the rounded rows by a cent).
  const commission = r2(byClinician.reduce((t, c) => t + c.cut, 0) + company.cut);
  const pendingCommission = r2(byClinician.reduce((t, c) => t + c.pending, 0) + company.pending);
  const blendedRate = `${(insuranceCollected > 0 ? (commission / insuranceCollected) * 100 : 0).toFixed(1)}%`;

  return { billerRate, insuranceCollected, billedCount: billedThisMonth.length, commission, pendingCommission, blendedRate, byClinician, company, comm: fns.comm };
}
