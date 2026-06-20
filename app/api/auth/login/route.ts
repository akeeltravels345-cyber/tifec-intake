import { NextResponse } from "next/server";
import { getClinicianByEmail } from "@/lib/clinicians";
import { getUser } from "@/lib/users";
import { verifyPassword, setSessionCookie } from "@/lib/auth";
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
