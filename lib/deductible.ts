// Pure deductible math, no server-only deps (safe to import in client
// components). The ClientProfile import below is type-only, so this module never
// pulls lib/clients (which uses fs) into a client bundle.
import type { ClientProfile } from "./clients";

const money2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface DeductibleSummary {
  amount: number;    // the deductible set by the insurer
  applied: number;   // total drawn down by sessions so far
  met: number;       // how much of the deductible is satisfied (= applied, capped)
  remaining: number; // how much of the deductible is still to go
}

/** Deductible position for a client: how much the sessions have drawn down and
 *  how much of the deductible is met vs still remaining. The deductible is a
 *  figure the insurer sets and counts DOWN as the patient pays out of pocket —
 *  it is not money the practice holds. */
export function deductibleSummary(p: ClientProfile): DeductibleSummary {
  const amount = money2(p.deductible?.amount ?? 0);
  const applied = money2((p.deductibleApplied ?? []).reduce((t, x) => t + (x.amount || 0), 0));
  const met = money2(Math.min(applied, amount));
  const remaining = money2(Math.max(0, amount - applied));
  return { amount, applied, met, remaining };
}
