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

/** The referral durations a biller can pick, in months. */
export const REFERRAL_MONTH_OPTIONS = [1, 3, 6] as const;
export type ReferralMonths = (typeof REFERRAL_MONTH_OPTIONS)[number];

/** Add N calendar months to a YYYY-MM-DD start date and return the end date as
 *  YYYY-MM-DD. The day is clamped to the last valid day of the target month
 *  (so 31 Jan + 1 month = 28/29 Feb). Returns "" when the start can't be parsed. */
export function addMonths(startISO: string | undefined, months: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startISO ?? "");
  if (!m || !Number.isFinite(months)) return "";
  const y = +m[1], mo = +m[2] - 1, d = +m[3];
  const target = new Date(Date.UTC(y, mo + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const dd = String(Math.min(d, lastDay)).padStart(2, "0");
  const mm = String(target.getUTCMonth() + 1).padStart(2, "0");
  return `${target.getUTCFullYear()}-${mm}-${dd}`;
}
