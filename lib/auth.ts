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
export async function setSessionCookie(clinicianId: string) {
  const pv = await passwordVersion(clinicianId);
  const store = await cookies();
  store.set(COOKIE_NAME, createSessionToken(clinicianId, pv), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
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
