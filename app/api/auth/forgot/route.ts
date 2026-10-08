import { NextResponse } from "next/server";
import { getClinicianByEmail } from "@/lib/clinicians";
import { getUser } from "@/lib/users";
import { makeResetToken, RESET_TTL_MINUTES } from "@/lib/passwordReset";
import { sendClientEmail } from "@/lib/email";
import { rateLimit } from "@/lib/ratelimit";
import { logAuth } from "@/lib/db";

export const runtime = "nodejs";

// Self-service password reset — step 1: email a reset link.
// Always answers the same way so it never reveals whether an account exists.
export async function POST(req: Request) {
  let body: { email?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const email = (body.email || "").trim();
  const ok = NextResponse.json({ ok: true });

  // Throttle silently (don't leak existence via timing or error shape).
  if (!rateLimit(`forgot:${email.toLowerCase()}`, 3, 15 * 60 * 1000).allowed) return ok;
  if (!email) return ok;

  const clinician = getClinicianByEmail(email);
  if (!clinician) return ok;
  const user = await getUser(clinician.id);
  if (!user) return ok; // no login provisioned yet — the admin still sets the first one

  const pv = Date.parse(user.updated_at) || 0;
  const token = makeResetToken(clinician.id, pv);
  const base = (process.env.APP_URL || "").replace(/\/$/, "") || "https://portal.caymanessentialcare.com";
  const link = `${base}/reset?token=${encodeURIComponent(token)}`;
  const firstName = clinician.name.split(/\s+/)[0] || "there";
  const text = [
    `Hi ${firstName},`,
    ``,
    `We received a request to reset your TIFEC portal password.`,
    `Open this link to choose a new password (it expires in ${RESET_TTL_MINUTES} minutes):`,
    ``,
    link,
    ``,
    `If you didn't request this, you can safely ignore this email — your password won't change.`,
    ``,
    `— The Institute for Essential Care`,
  ].join("\n");

  try {
    await sendClientEmail(clinician.email, "Reset your TIFEC portal password", text);
    await logAuth(clinician.id, "password", "requested password reset");
  } catch { /* never surface send/log failures to the requester */ }
  return ok;
}
