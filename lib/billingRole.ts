// Billing role resolution + server-side access helpers for the /billing area.
import { cookies } from "next/headers";
import { getCurrentClinician } from "./auth";
import type { Clinician } from "./clinicians";

// The practice owner (Dr. Shion) sees the whole business AND their own clients.
// A biller marks insurance payments. A clinician sees only their own numbers.
export type BillingRole = "clinician" | "biller" | "owner";

/** BETA gate: only enrolled accounts can see + open the billing system. */
export const hasBillingBeta = (c: Clinician): boolean => !!c.billingBeta;

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
  let role = billingRoleOf(c);
  // LOCAL DEV ONLY: the "View as" switcher can force a role via the `dev_role` cookie.
  if (process.env.NODE_ENV !== "production" && process.env.DEV_AUTOLOGIN) {
    const forced = (await cookies()).get("dev_role")?.value;
    if (forced === "owner" || forced === "biller" || forced === "clinician") role = forced;
  }
  return { clinician: c, role };
}

/** Is the local dev bypass active? (Server-only; always false in production.) */
export function devMode(): boolean {
  return process.env.NODE_ENV !== "production" && !!process.env.DEV_AUTOLOGIN;
}

// Owners see the business overview + every clinician; billers + owners mark billed;
// only owners configure the practice. Every signed-in person sees their own clients.
export const isOwner = (r: BillingRole) => r === "owner";
export const canMarkBilled = (r: BillingRole) => r === "biller" || r === "owner";
/** The biller's own workspace: his outside clients and his imports. The owner
 *  wants a snapshot of the practice, not the biller's private book, so these
 *  are his alone. */
export const isBiller = (r: BillingRole) => r === "biller";
export const canConfigure = (r: BillingRole) => r === "owner";
/** Billing-operational config (insurers, claim codes, service codes, provider
 *  details, sample data) — the biller's own area. The owner's money rules
 *  (commission, expenses, clinician splits) stay behind canConfigure. */
export const canConfigureBilling = (r: BillingRole) => r === "biller" || r === "owner";
export const canSeeBusiness = (r: BillingRole) => r === "owner";

// Backwards-compatible alias (old name).
export const canMarkPaid = canMarkBilled;
