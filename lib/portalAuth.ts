// Passwordless access to the client self-service portal. A client enters their
// email; if we hold appointments for it, we email a signed link. The token is an
// HMAC of the (lowercased) email + an expiry, so nothing is stored and it can't
// be forged, but it IS a bearer link: anyone with the URL can see that client's
// appointments, so it's emailed only to the address itself and expires.
import crypto from "crypto";

const secret = () => process.env.CALENDAR_FEED_SECRET || process.env.SESSION_SECRET || "";
const TTL_MS = 30 * 24 * 3600 * 1000; // links last 30 days; re-request is one step

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret() || "x").update(`portal:${payload}`).digest("base64url").slice(0, 32);
}

export function portalToken(email: string, now = Date.now()): string {
  const payload = Buffer.from(`${email.trim().toLowerCase()}\n${now + TTL_MS}`).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readPortalToken(token: string): { email: string } | null {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  try { if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null; } catch { return null; }
  const [email, expiryStr] = Buffer.from(payload, "base64url").toString("utf8").split("\n");
  const expiry = Number(expiryStr);
  if (!email || !Number.isFinite(expiry) || Date.now() > expiry) return null;
  return { email };
}
