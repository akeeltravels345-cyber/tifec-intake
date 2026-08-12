import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { billingRoleOf, canMarkPaid } from "@/lib/billingRole";
import { markSessionPaid, markSessionBilled, markSelfPayPaid, markSessionAdjusted, markSessionUnadjusted, getSession } from "@/lib/billing";

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function POST(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!canMarkPaid(billingRoleOf(me))) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const sessionId = String(body.sessionId ?? "");
  if (!sessionId) return NextResponse.json({ error: "Missing session." }, { status: 400 });

  // Two lifecycle actions:
  //   action "billed" → submitted to the insurer (billed_date). Doesn't pay out.
  //   action "paid"   → insurer settled (paid_date). This is collected money.
  // Back-compat: a body with `paid` and no `action` is treated as a paid action.
  const action = body.action ? String(body.action) : "paid";

  if (action === "billed") {
    const billed = body.billed !== false; // default true
    const billedDate = body.billedDate ? String(body.billedDate) : null;
    if (billed && (!billedDate || !isDate(billedDate)))
      return NextResponse.json({ error: "A valid billed date is required." }, { status: 400 });
    const ok = await markSessionBilled(sessionId, billed, billed ? billedDate : null);
    if (!ok) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  // action "adjust" → settle a claim as a contractual write-off / write-down.
  if (action === "adjust") {
    const disposition = body.disposition === "writedown" ? "writedown" : "writeoff";
    const collected = Number.isFinite(Number(body.insuranceCollected)) ? Math.max(0, Number(body.insuranceCollected)) : 0;
    const settleDate = body.paidDate ? String(body.paidDate) : null;
    if (!settleDate || !isDate(settleDate)) return NextResponse.json({ error: "A valid settled date is required." }, { status: 400 });
    const ok = await markSessionAdjusted(sessionId, disposition, collected, settleDate);
    if (!ok) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  // action "unadjust" → undo a write-off / write-down, back to Awaiting payment.
  if (action === "unadjust") {
    const ok = await markSessionUnadjusted(sessionId);
    if (!ok) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const paid = body.paid !== false; // default true
  const paidDate = body.paidDate ? String(body.paidDate) : null;
  if (paid && (!paidDate || !isDate(paidDate)))
    return NextResponse.json({ error: "A valid paid date is required." }, { status: 400 });

  // Self-pay is settled by the client, not an insurer: record the fee as collected
  // rather than flipping the insurance_paid flag.
  const session = await getSession(sessionId);
  const ok = session && !session.insurerId
    ? await markSelfPayPaid(sessionId, paid, paid ? paidDate : null)
    : await markSessionPaid(sessionId, paid, paid ? paidDate : null);
  if (!ok) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
