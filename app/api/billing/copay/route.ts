import { NextResponse } from "next/server";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { getSession, markCopayCollected } from "@/lib/billing";
import { caymanToday } from "@/lib/caymanTime";

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Record when an outstanding co-pay came in (or undo it). A clinician may only
// touch their own visits; the biller / owner / admin may touch any.
export async function POST(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }

  const sessionId = String(body.sessionId ?? "");
  const s = await getSession(sessionId);
  if (!s) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const isAdmin = user.clinician.contact === "admin";
  const canAll = isBiller(user.role) || isOwner(user.role) || isAdmin;
  if (!canAll && s.clinicianId !== user.clinician.id) {
    return NextResponse.json({ error: "You can only record co-pays on your own visits." }, { status: 403 });
  }

  if (body.action === "undo") {
    await markCopayCollected(sessionId, 0, null);
    return NextResponse.json({ ok: true });
  }

  // Default to the full co-pay that was due; a partial amount may be passed.
  const amount = Number.isFinite(Number(body.amount)) ? Math.max(0, Number(body.amount)) : (s.copayDue || 0);
  const date = body.date && isDate(String(body.date)) ? String(body.date) : caymanToday();
  const ok = await markCopayCollected(sessionId, amount, date);
  if (!ok) return NextResponse.json({ error: "Could not record the co-pay." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
