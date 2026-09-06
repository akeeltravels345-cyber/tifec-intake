import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { isSystemAdmin, getClinician } from "@/lib/clinicians";
import { createSyncToken } from "@/lib/practicumSync";

export const dynamic = "force-dynamic";

// Mint the bearer token a practicum clinician pastes into their dashboard.
//
//   GET /api/practicum/token                    -> your own token (practicum clinicians)
//   GET /api/practicum/token?clinicianId=xyz    -> someone else's (admin only)
//
// Cookie-authed and same-origin on purpose: this hands out a long-lived
// credential, so it is deliberately harder to reach than the feed it unlocks.
// Rotating PRACTICUM_SYNC_SECRET invalidates every token already issued.
export async function GET(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const requested = new URL(req.url).searchParams.get("clinicianId");
  const targetId = requested ?? me.id;

  if (targetId !== me.id && !isSystemAdmin(me)) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const target = getClinician(targetId);
  if (!target) return NextResponse.json({ error: "Unknown clinician." }, { status: 404 });
  if (!target.practicum) {
    return NextResponse.json({ error: "Not a practicum clinician." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    clinicianId: target.id,
    clinicianName: target.name,
    token: createSyncToken(target.id),
  });
}
