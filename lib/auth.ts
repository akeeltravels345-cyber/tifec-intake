// Authentication primitives: password hashing (scrypt) + signed session cookies.
// Uses only Node's built-in crypto - no bcrypt/native deps, no external auth service.

import crypto from "crypto";
import { cookies } from "next/headers";
import { getClinician, isSystemAdmin, type Clinician } from "./clinicians";
import { getUser } from "./users";

// Cookie the system admin sets to "view as" another person. It is ONLY ever
// honoured when the real signed-in user is a system admin (checked server-side),
// so a non-admin setting it themselves does nothing.
const VIEW_AS_COOKIE = "admin_as";

const COOKIE_NAME = "tifec_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

// ---------------------------------------------------------------------------
// Password hashing (scrypt)  →  stored as "salt:hash" (both hex)
// ---------------------------------------------------------------------------
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const derived = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

// ---------------------------------------------------------------------------
// Session token: base64url(payload).hmac
// ---------------------------------------------------------------------------
function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET must be set (32+ chars). Generate with: openssl rand -hex 32");
  }
  return s;
}

function sign(payloadB64: string): string {
  return crypto.createHmac("sha256", sessionSecret()).update(payloadB64).digest("base64url");
}

// `pv` (password version) = the user's password updated_at, in epoch ms. Baking
// it into the token lets a password change invalidate all prior sessions.
export function createSessionToken(clinicianId: string, pv: number): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payloadB64 = Buffer.from(JSON.stringify({ cid: clinicianId, pv, exp })).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

function verifySessionToken(token: string): { cid: string; pv: number } | null {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    const { cid, pv, exp } = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (typeof exp !== "number" || exp < Math.floor(Date.now() / 1000)) return null;
    // Old tokens (no pv) get -1, which won't match any real version → forces re-login.
    return { cid, pv: typeof pv === "number" ? pv : -1 };
  } catch {
    return null;
  }
}

/** A clinician's current password version (updated_at as epoch ms; 0 if no login set). */
async function passwordVersion(clinicianId: string): Promise<number> {
  const user = await getUser(clinicianId);
  if (!user) return 0;
  const t = Date.parse(user.updated_at);
  return Number.isFinite(t) ? t : 0;
}

// ---------------------------------------------------------------------------
// Cookie helpers (call from route handlers / server actions only)
// ---------------------------------------------------------------------------
// Setting COOKIE_DOMAIN (e.g. ".caymanessentialcare.com") shares the session
// across subdomains, so a clinician signed in on the portal is already signed
// in on the standalone scheduling app (and vice versa). Unset = host-only (the
// original behaviour), so a single-domain deployment is unaffected.
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;

export async function setSessionCookie(clinicianId: string) {
  const pv = await passwordVersion(clinicianId);
  const store = await cookies();
  store.set(COOKIE_NAME, createSessionToken(clinicianId, pv), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  // Overwrite with an expired cookie on the same domain so a shared-domain
  // session is actually cleared (store.delete alone won't match a Domain cookie).
  store.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  });
  store.delete(COOKIE_NAME);
}

// ---------------------------------------------------------------------------
// Two-step login (MFA) challenge.
//
// When a password is correct but the account has two-step login on, we do NOT
// create a session yet. Instead we set this short-lived, signed "challenge"
// cookie naming who is half-logged-in, and only exchange it for a real session
// once the one-time code is verified (POST /api/auth/mfa). It carries no
// privileges on its own and expires in minutes, so a stolen password is useless
// without the second factor.
// ---------------------------------------------------------------------------
const MFA_COOKIE = "tifec_mfa";
const MFA_TTL_SECONDS = 5 * 60; // 5 minutes to enter the code

export function createMfaChallengeToken(clinicianId: string): string {
  const exp = Math.floor(Date.now() / 1000) + MFA_TTL_SECONDS;
  const payloadB64 = Buffer.from(JSON.stringify({ cid: clinicianId, exp, k: "mfa" })).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

function verifyMfaChallengeToken(token: string): string | null {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { cid, exp, k } = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (k !== "mfa" || typeof exp !== "number" || exp < Math.floor(Date.now() / 1000)) return null;
    return typeof cid === "string" ? cid : null;
  } catch {
    return null;
  }
}

export async function setMfaChallengeCookie(clinicianId: string) {
  const store = await cookies();
  store.set(MFA_COOKIE, createMfaChallengeToken(clinicianId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MFA_TTL_SECONDS,
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  });
}

export async function clearMfaChallengeCookie() {
  const store = await cookies();
  store.set(MFA_COOKIE, "", {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: 0, ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  });
  store.delete(MFA_COOKIE);
}

/** The clinician id of a valid, unexpired MFA challenge, or null. */
export async function getMfaChallengeClinicianId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(MFA_COOKIE)?.value;
  return token ? verifyMfaChallengeToken(token) : null;
}

/** The REAL signed-in clinician (ignoring any admin "view as"), or null. */
async function resolveRealClinician(store: Awaited<ReturnType<typeof cookies>>): Promise<Clinician | null> {
  // 1) A real signed-in session always wins — this is how per-person logins work.
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    try {
      const session = verifySessionToken(token);
      if (session) {
        const clinician = getClinician(session.cid) ?? null;
        if (clinician) {
          let valid = true;
          // Revocation: a password change bumps updated_at, invalidating older tokens.
          try { valid = session.pv === (await passwordVersion(session.cid)); } catch { valid = true; }
          if (valid) return clinician;
        }
      }
    } catch {
      /* fall through to the dev fallback / logged-out */
    }
  }

  // 2) LOCAL DEV ONLY (never in production): when nobody is logged in and DEV_AUTOLOGIN
  // is set, act as the clinician named by the `dev_as` cookie (the "View as" switcher),
  // defaulting to DEV_AUTOLOGIN. Step 1 (a real login) always takes precedence.
  if (process.env.NODE_ENV !== "production" && process.env.DEV_AUTOLOGIN) {
    const who = store.get("dev_as")?.value || process.env.DEV_AUTOLOGIN;
    return getClinician(who) ?? getClinician(process.env.DEV_AUTOLOGIN) ?? null;
  }

  return null;
}

/**
 * The EFFECTIVE clinician for the request. Normally the real signed-in user, but
 * if that user is a system admin and has set the "view as" cookie, we return the
 * impersonated clinician so every page + the menu render exactly as that person
 * sees them. Safe to call in server components.
 */
export async function getCurrentClinician(): Promise<Clinician | null> {
  const store = await cookies();
  const real = await resolveRealClinician(store);
  if (!real) return null;
  if (isSystemAdmin(real)) {
    const as = store.get(VIEW_AS_COOKIE)?.value;
    if (as && as !== real.id) {
      const target = getClinician(as);
      if (target) return target;
    }
  }
  return real;
}

/**
 * Impersonation state for the sidebar switcher + banner. `real` is who is truly
 * signed in; `impersonating` is true when a system admin is viewing as someone
 * else. Only a system admin can ever impersonate.
 */
export async function getViewAsState(): Promise<{ real: Clinician; effective: Clinician; impersonating: boolean } | null> {
  const store = await cookies();
  const real = await resolveRealClinician(store);
  if (!real) return null;
  let effective = real;
  if (isSystemAdmin(real)) {
    const as = store.get(VIEW_AS_COOKIE)?.value;
    if (as && as !== real.id) {
      const target = getClinician(as);
      if (target) effective = target;
    }
  }
  return { real, effective, impersonating: effective.id !== real.id };
}
