import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { billingRoleOf, canMarkPaid } from "@/lib/billingRole";
import { markSessionPaid } from "@/lib/billing";

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
  const paid = body.paid !== false; // default true
  const paidDate = body.paidDate ? String(body.paidDate) : null;

  if (!sessionId) return NextResponse.json({ error: "Missing session." }, { status: 400 });
  if (paid && (!paidDate || !/^\d{4}-\d{2}-\d{2}$/.test(paidDate)))
    return NextResponse.json({ error: "A valid paid date is required." }, { status: 400 });

  const ok = await markSessionPaid(sessionId, paid, paid ? paidDate : null);
  if (!ok) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
