// Billing role resolution + server-side access helpers for the /billing area.
import { getCurrentClinician } from "./auth";
import type { Clinician } from "./clinicians";

export type BillingRole = "clinician" | "biller" | "admin";

export function billingRoleOf(c: Clinician): BillingRole {
  if (c.admin || c.billing === "admin") return "admin";
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

export const canMarkPaid = (r: BillingRole) => r === "biller" || r === "admin";
export const canConfigure = (r: BillingRole) => r === "admin";
export const canLogSessions = () => true; // every signed-in clinician can log their own
