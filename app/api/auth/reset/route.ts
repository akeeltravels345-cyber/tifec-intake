import { NextResponse } from "next/server";
import { getUser, setUserPassword } from "@/lib/users";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { readResetToken } from "@/lib/passwordReset";
import { rateLimit } from "@/lib/ratelimit";
import { logAuth } from "@/lib/db";

export const runtime = "nodejs";

// Self-service password reset — step 2: set a new password from a valid link.
export async function POST(req: Request) {
  let body: { token?: string; password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const parsed = readResetToken(body.token || "");
  if (!parsed) return NextResponse.json({ error: "This reset link is invalid or has expired. Request a new one." }, { status: 400 });

  // Light throttle on the set step, per account.
  if (!rateLimit(`reset:${parsed.cid}`, 10, 15 * 60 * 1000).allowed) {
    return NextResponse.json({ error: "Too many attempts. Please try again shortly." }, { status: 429 });
  }

  const pw = body.password || "";
  if (pw.length < 8) return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });

  const user = await getUser(parsed.cid);
  if (!user) return NextResponse.json({ error: "This reset link is no longer valid." }, { status: 400 });
  // The token is bound to the password version at issue. If it no longer matches,
  // the password has already changed since the link was sent → the link is spent.
  const currentPv = Date.parse(user.updated_at) || 0;
  if (currentPv !== parsed.pv) return NextResponse.json({ error: "This reset link has already been used. Request a new one." }, { status: 409 });

  try {
    await setUserPassword(parsed.cid, hashPassword(pw)); // bumps updated_at → invalidates old sessions + this token
    await setSessionCookie(parsed.cid);                  // sign in on this device with the new password version
    await logAuth(parsed.cid, "password", "reset password via email link");
  } catch {
    return NextResponse.json({ error: "Could not update the password. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
