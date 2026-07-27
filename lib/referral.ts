// =============================================================================
// Referral validity (pure). A referral authorises billing up to its end date;
// a session whose date of service is after that date can't be paid. This is the
// single source of truth for "is the referral still good?" used on the client
// record, the add-charge form and anywhere a charge is checked.
// =============================================================================

export type ReferralState = "none" | "valid" | "expiring" | "expired";

export interface ReferralStatus {
  state: ReferralState;
  daysLeft: number | null; // days until endDate (negative if past); null if no end date
}

/** Days between two YYYY-MM-DD dates (b − a), or null if unparseable. */
function dayDiff(aISO: string, bISO: string): number | null {
  const a = Date.parse(`${aISO}T00:00:00Z`), b = Date.parse(`${bISO}T00:00:00Z`);
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** Classify a referral's validity as of `todayISO`. "expiring" = within 30 days. */
export function referralStatus(endDate: string | undefined, todayISO: string): ReferralStatus {
  if (!endDate) return { state: "none", daysLeft: null };
  const days = dayDiff(todayISO, endDate);
  if (days === null) return { state: "none", daysLeft: null };
  if (days < 0) return { state: "expired", daysLeft: days };
  if (days <= 30) return { state: "expiring", daysLeft: days };
  return { state: "valid", daysLeft: days };
}

/** True when a date of service falls after the referral's end date (won't pay). */
export function chargeAfterReferral(dateOfService: string, endDate: string | undefined): boolean {
  return !!endDate && dateOfService > endDate;
}
