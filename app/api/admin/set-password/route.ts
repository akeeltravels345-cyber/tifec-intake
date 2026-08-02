import { NextResponse } from "next/server";
import { getClinician, isSystemAdmin } from "@/lib/clinicians";
import { setUserPassword } from "@/lib/users";
import { hashPassword, getCurrentClinician } from "@/lib/auth";
import { logAuth } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { adminKey?: string; clinicianId?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Authorize via EITHER a logged-in admin session OR the bootstrap ADMIN_PASSWORD.
  const me = await getCurrentClinician();
  const sessionAdmin = isSystemAdmin(me);
  const expected = process.env.ADMIN_PASSWORD;
  const bootstrapOk = !!expected && body.adminKey === expected;

  if (!sessionAdmin && !bootstrapOk) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!body.clinicianId || !getClinician(body.clinicianId)) {
    return NextResponse.json({ error: "Unknown clinician." }, { status: 400 });
  }
  if (!body.password || body.password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  await setUserPassword(body.clinicianId, hashPassword(body.password));
  await logAuth(body.clinicianId, "password", sessionAdmin ? "password set by admin" : "password set via bootstrap");
  return NextResponse.json({ ok: true });
}
