import { NextResponse } from "next/server";
import { getClinicianByEmail } from "@/lib/clinicians";
import { getUser, getMfaState } from "@/lib/users";
import { verifyPassword, setSessionCookie, setMfaChallengeCookie } from "@/lib/auth";
import { logAuth } from "@/lib/db";
import { rateLimit, rateLimitReset } from "@/lib/ratelimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = (body.email || "").trim();
  const password = body.password || "";

  // Brute-force protection: max 8 attempts per email per 15 minutes.
  const key = `login:${email.toLowerCase()}`;
  const limit = rateLimit(key, 8, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Please try again in ${Math.ceil(limit.retryAfterSec / 60)} minute(s).` },
      { status: 429 }
    );
  }

  // Generic error message - never reveal whether the email exists.
  const fail = () => NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });

  if (!email || !password) return fail();

  const clinician = getClinicianByEmail(email);
  if (!clinician) return fail();

  const user = await getUser(clinician.id);
  if (!user) return fail();

  let valid = false;
  try {
    valid = verifyPassword(password, user.password_hash);
  } catch {
    return NextResponse.json(
      { error: "Server is not fully configured. Contact your administrator." },
      { status: 500 }
    );
  }
  if (!valid) {
    // Log failed attempts only for known accounts (avoid storing attacker emails).
    await logAuth(clinician.id, "login_failed", "failed sign-in");
    return fail();
  }

  // Two-step login: a correct password is only step one. If this account has it
  // turned on, issue a short-lived challenge instead of a session, and let the
  // client collect the one-time code (verified at POST /api/auth/mfa).
  let mfa = { enabled: false };
  try { mfa = await getMfaState(clinician.id); } catch { /* columns absent → treat as off */ }
  if (mfa.enabled) {
    try {
      await setMfaChallengeCookie(clinician.id);
    } catch {
      return NextResponse.json(
        { error: "Server session is not configured (SESSION_SECRET). Contact your administrator." },
        { status: 500 }
      );
    }
    rateLimitReset(key); // password proven; the code step has its own limiter
    return NextResponse.json({ ok: true, mfa: true });
  }

  try {
    await setSessionCookie(clinician.id);
  } catch {
    // Most likely SESSION_SECRET is missing/short.
    return NextResponse.json(
      { error: "Server session is not configured (SESSION_SECRET). Contact your administrator." },
      { status: 500 }
    );
  }

  rateLimitReset(key);
  await logAuth(clinician.id, "login", "signed in");
  return NextResponse.json({ ok: true });
}
