// A private, stable per-clinician token for their calendar subscribe URL. The
// token is an HMAC of the clinician id, so it never needs storing and is
// unguessable, but it IS a bearer secret: anyone with the URL can read that
// clinician's schedule (client names included), so the URL must stay private.
import crypto from "crypto";

const secret = (): string => process.env.CALENDAR_FEED_SECRET || process.env.SESSION_SECRET || "";

export function calendarFeedToken(clinicianId: string): string {
  const s = secret();
  if (!s) return "";
  return crypto.createHmac("sha256", s).update(`calfeed:${clinicianId}`).digest("base64url").slice(0, 32);
}

export function verifyCalendarFeedToken(clinicianId: string, token: string): boolean {
  const expected = calendarFeedToken(clinicianId);
  if (!expected || !token || expected.length !== token.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token)); } catch { return false; }
}

/** The subscribe path for a clinician's feed (prefix with the origin). */
export function calendarFeedPath(clinicianId: string): string {
  return `/api/calendar/${encodeURIComponent(clinicianId)}/${calendarFeedToken(clinicianId)}`;
}
