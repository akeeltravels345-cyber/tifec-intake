// =============================================================================
// Two-step login (MFA) — TOTP, the "authenticator app" standard (RFC 6238).
//
// A time-based 6-digit code that an app like Google Authenticator, Microsoft
// Authenticator, 1Password or Authy generates from a shared secret. No external
// dependency — just Node's built-in crypto. The secret is created once at
// enrollment, shown to the user as a QR code + typed key, and from then on both
// the phone and the server compute the same rolling code independently, so the
// server never has to send anything (unlike email/SMS codes).
//
// The shared secret is sensitive: it is stored ENCRYPTED (lib/crypto) in the
// clinician_users table, never in plaintext.
// =============================================================================

import crypto from "crypto";

const STEP_SECONDS = 30; // code changes every 30s (the universal default)
const DIGITS = 6;
// How many 30s windows either side of "now" we still accept, to tolerate clock
// drift between the phone and the server. ±1 window = up to ~90s of slack.
const WINDOW = 1;

// ---- base32 (RFC 4648, no padding) — the alphabet authenticator apps expect --
const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh random TOTP secret, as a base32 string (what the user scans/types). */
export function generateSecret(): string {
  return base32Encode(crypto.randomBytes(20)); // 160-bit, per RFC 4226 recommendation
}

/** The 6-digit code for a given base32 secret at a given time (ms since epoch). */
function codeForStep(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  // Write the 64-bit counter big-endian.
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (bin % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

/** The current code (for display/testing). */
export function currentCode(secret: string, now: number = Date.now()): string {
  return codeForStep(secret, Math.floor(now / 1000 / STEP_SECONDS));
}

/**
 * True if `token` matches the secret within the accepted time window. Accepts
 * the current 30s code and one window either side (clock-drift tolerance), and
 * compares in constant time so a close-but-wrong code leaks no timing signal.
 */
export function verifyCode(secret: string, token: string, now: number = Date.now()): boolean {
  const clean = (token || "").replace(/\D/g, "");
  if (clean.length !== DIGITS) return false;
  const counter = Math.floor(now / 1000 / STEP_SECONDS);
  for (let w = -WINDOW; w <= WINDOW; w++) {
    const expected = codeForStep(secret, counter + w);
    if (clean.length === expected.length && crypto.timingSafeEqual(Buffer.from(clean), Buffer.from(expected))) {
      return true;
    }
  }
  return false;
}

/**
 * The otpauth:// URI an authenticator app reads from the QR code. `account` is
 * what the user sees in their app (their email), `issuer` names the practice.
 */
export function otpauthUri(secret: string, account: string, issuer = "Cayman Essential Care"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ---- backup / recovery codes ------------------------------------------------
// One-time codes the user saves somewhere safe, to get in if they lose their
// phone. Shown ONCE at enrollment; only their hashes are stored.

/** Ten human-friendly one-time backup codes, e.g. "4f2a-9c1b". */
export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const hex = crypto.randomBytes(4).toString("hex"); // 8 hex chars
    codes.push(`${hex.slice(0, 4)}-${hex.slice(4)}`);
  }
  return codes;
}

/** Normalise a backup code for matching (strip spaces/dashes, lower-case). */
export function normalizeBackupCode(code: string): string {
  return (code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Store backup codes one-way hashed (scrypt), like passwords — "salt:hash" hex. */
export function hashBackupCode(code: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(normalizeBackupCode(code), salt, 32);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyBackupCode(code: string, stored: string): boolean {
  const [saltHex, hashHex] = (stored || "").split(":");
  if (!saltHex || !hashHex) return false;
  const derived = crypto.scryptSync(normalizeBackupCode(code), Buffer.from(saltHex, "hex"), 32);
  const expected = Buffer.from(hashHex, "hex");
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}
