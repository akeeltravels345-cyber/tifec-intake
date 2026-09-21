// =============================================================================
// External busy times, so the scheduler never offers a slot when the clinician
// is busy on another calendar. Two sources:
//   - Their connected Google Calendar (via videoConnections.googleBusy;
//     recurring events are expanded server-side by Google).
//   - Any external iCal (.ics) subscribe URLs they've added (personal Google
//     secret address, Outlook, etc.). Non-recurring events only.
// Results are cached briefly so browsing days doesn't refetch on every request.
// =============================================================================

import { googleBusy, type BusyInterval } from "./videoConnections";

const CACHE = new Map<string, { exp: number; data: BusyInterval[] }>();
const TTL_MS = 120_000;

// ---- iCal parsing ----------------------------------------------------------

// The UTC instant of a wall-clock time in a named zone (offset-finding trick).
function zonedToUtcMs(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): number {
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(asUtc));
    const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
    const local = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second"));
    return asUtc - (local - asUtc);
  } catch { return asUtc; }
}

// Parse a DTSTART/DTEND value (with its params) to a UTC ISO string, or null for
// all-day / unparseable values.
function parseDt(params: string, value: string): string | null {
  if (/VALUE=DATE(?!-TIME)/i.test(params)) return null; // all-day
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const n = (v: string) => Number(v);
  if (z) return new Date(Date.UTC(n(y), n(mo) - 1, n(d), n(h), n(mi), n(s))).toISOString();
  const tz = params.match(/TZID=([^;:]+)/i)?.[1];
  if (tz) return new Date(zonedToUtcMs(n(y), n(mo), n(d), n(h), n(mi), n(s), tz)).toISOString();
  // Floating time (no Z, no TZID): best-effort, treat as UTC.
  return new Date(Date.UTC(n(y), n(mo) - 1, n(d), n(h), n(mi), n(s))).toISOString();
}

function parseIcs(text: string, fromISO: string, toISO: string): BusyInterval[] {
  // Unfold continuation lines (RFC 5545: a leading space/tab continues the prior).
  const lines = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const from = Date.parse(fromISO), to = Date.parse(toISO);
  const out: BusyInterval[] = [];
  let inEvent = false, cancelled = false, transparent = false, start: string | null = null, end: string | null = null, title = "";
  for (const line of lines) {
    const u = line.toUpperCase();
    if (u === "BEGIN:VEVENT") { inEvent = true; cancelled = transparent = false; start = end = null; title = ""; continue; }
    if (u === "END:VEVENT") {
      if (inEvent && start && end && !cancelled && !transparent) {
        const s = Date.parse(start), e = Date.parse(end);
        if (e > from && s < to) out.push({ start, end, title: title || undefined, source: "ical" }); // overlaps the window
      }
      inEvent = false; continue;
    }
    if (!inEvent) continue;
    const ci = line.indexOf(":");
    if (ci < 0) continue;
    const name = line.slice(0, ci), val = line.slice(ci + 1);
    const key = name.split(";")[0].toUpperCase();
    if (key === "DTSTART") start = parseDt(name, val);
    else if (key === "DTEND") end = parseDt(name, val);
    else if (key === "SUMMARY") title = val.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/gi, " ").replace(/\\\\/g, "\\").trim().slice(0, 80);
    else if (key === "STATUS" && /CANCELLED/i.test(val)) cancelled = true;
    else if (key === "TRANSP" && /TRANSPARENT/i.test(val)) transparent = true;
  }
  return out;
}

async function icalBusy(url: string, fromISO: string, toISO: string): Promise<BusyInterval[]> {
  try {
    const res = await fetch(url, { headers: { Accept: "text/calendar" }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    return parseIcs(await res.text(), fromISO, toISO);
  } catch { return []; }
}

// ---- Combined --------------------------------------------------------------

/** All external busy intervals for a clinician in [fromISO, toISO): their Google
 *  Calendar plus each saved iCal feed. Cached briefly. Never throws. */
export async function externalBusyIntervals(clinicianId: string, feeds: string[], fromISO: string, toISO: string): Promise<BusyInterval[]> {
  const cacheKey = `${clinicianId}|${fromISO}|${toISO}`;
  const hit = CACHE.get(cacheKey);
  if (hit && hit.exp > Date.now()) return hit.data;
  const parts = await Promise.all([
    googleBusy(clinicianId, fromISO, toISO),
    ...feeds.filter(Boolean).map((u) => icalBusy(u, fromISO, toISO)),
  ]);
  const data = parts.flat();
  CACHE.set(cacheKey, { exp: Date.now() + TTL_MS, data });
  return data;
}
