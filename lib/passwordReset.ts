// Stateless password-reset tokens — no new table.
//
// An HMAC-signed token (keyed by SESSION_SECRET) carries the clinician id, an
// expiry, and the account's password VERSION at issue time (updated_at epoch ms).
// Verifying re-checks the signature + expiry and that the password version still
// matches the account's current one. A successful reset (or an admin reset) bumps
// updated_at, which changes the version and kills the token — so a link is
// effectively single-use and can't be replayed. Mirrors how lib/auth.ts versions
// its session cookies, so there's nothing new to store or clean up.
import crypto from "crypto";

const TTL_MS = 60 * 60 * 1000; // links are valid for 1 hour
export const RESET_TTL_MINUTES = TTL_MS / 60000;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET must be set (32+ chars) for password resets.");
  return s;
}

export function makeResetToken(clinicianId: string, pv: number): string {
  const body = Buffer.from(JSON.stringify({ cid: clinicianId, pv, exp: Date.now() + TTL_MS })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readResetToken(token: string): { cid: string; pv: number } | null {
  try {
    const [body, sig] = (token || "").split(".");
    if (!body || !sig) return null;
    const expect = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
    const a = Buffer.from(sig), b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const { cid, pv, exp } = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof cid !== "string" || typeof pv !== "number" || typeof exp !== "number") return null;
    if (Date.now() > exp) return null;
    return { cid, pv };
  } catch { return null; }
}
