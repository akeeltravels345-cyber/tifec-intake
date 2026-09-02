import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { setIdleMinutes, clampIdleMinutes, IDLE_MINUTES_CHOICES } from "@/lib/users";
import { logAccess } from "@/lib/db";

export const runtime = "nodejs";

// Set the signed-in user's auto-logout window. Capped to the allowed choices so
// the HIPAA automatic-logoff safeguard can be relaxed but never removed.
export async function POST(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { minutes?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  if (!(IDLE_MINUTES_CHOICES as readonly number[]).includes(Number(body.minutes))) {
    return NextResponse.json({ error: "Pick one of the allowed auto-logout times." }, { status: 400 });
  }
  const minutes = clampIdleMinutes(body.minutes);
  await setIdleMinutes(me.id, minutes);
  // Security-relevant preference change — record it in the audit log.
  await logAccess({ id: crypto.randomUUID(), clinician_id: me.id, submission_token: "", action: "status", detail: `set auto-logout to ${minutes} min`, at: new Date().toISOString() });
  return NextResponse.json({ ok: true, minutes });
}
