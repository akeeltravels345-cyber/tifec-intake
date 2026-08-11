// The practice is in the Cayman Islands, which uses UTC−5 all year (no daylight
// saving). Servers run on UTC, so anything that picks "what day / month is it"
// from the server clock rolls over ~5 hours early (after ~7pm Cayman the UTC date
// is already tomorrow). These helpers pin user-facing CALENDAR values to Cayman.
//
// Only for calendar day/month choices (today, date of service, current payout
// month). Precise instants (created_at, message times) stay UTC — correct as-is.
// Pure (Intl only), so server and client agree.

const CAYMAN_TZ = "America/Cayman";

function caymanParts(d: Date): { year: number; month: number; day: number } {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: CAYMAN_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return { year: g("year"), month: g("month"), day: g("day") };
}

/** Today's calendar date in Cayman as "YYYY-MM-DD". */
export function caymanToday(d: Date = new Date()): string {
  const { year, month, day } = caymanParts(d);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The current year and month (1-12) in Cayman — for defaulting month views. */
export function caymanYearMonth(d: Date = new Date()): { year: number; month: number } {
  const { year, month } = caymanParts(d);
  return { year, month };
}
