// Billing role resolution + server-side access helpers for the /billing area.
import { getCurrentClinician } from "./auth";
import type { Clinician } from "./clinicians";

// The practice owner (Dr. Shion) sees the whole business AND their own clients.
// A biller marks insurance payments. A clinician sees only their own numbers.
export type BillingRole = "clinician" | "biller" | "owner";

export function billingRoleOf(c: Clinician): BillingRole {
  if (c.admin || c.billing === "admin") return "owner";
  if (c.billing === "biller") return "biller";
  return "clinician";
}

export interface BillingUser {
  clinician: Clinician;
  role: BillingRole;
}

/** Current signed-in user + their billing role, or null if not signed in. */
export async function getBillingUser(): Promise<BillingUser | null> {
  const c = await getCurrentClinician();
  if (!c) return null;
  return { clinician: c, role: billingRoleOf(c) };
}

// Owners see the business overview + every clinician; billers + owners mark billed;
// only owners configure the practice. Every signed-in person sees their own clients.
export const isOwner = (r: BillingRole) => r === "owner";
export const canMarkBilled = (r: BillingRole) => r === "biller" || r === "owner";
export const canConfigure = (r: BillingRole) => r === "owner";
export const canSeeBusiness = (r: BillingRole) => r === "owner";

// Backwards-compatible alias (old name).
export const canMarkPaid = canMarkBilled;
