import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { insertSession } from "@/lib/billing";

export async function POST(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const clientFirst = String(body.clientFirst ?? "").trim();
  const clientLast = String(body.clientLast ?? "").trim();
  const dateOfService = String(body.dateOfService ?? "").trim();
  const totalCost = Number(body.totalCost);

  if (!clientFirst || !clientLast) return NextResponse.json({ error: "Client name is required." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfService)) return NextResponse.json({ error: "A valid date of service is required." }, { status: 400 });
  if (isNaN(totalCost) || totalCost < 0) return NextResponse.json({ error: "Total service cost must be a number." }, { status: 400 });

  const cptCodes = Array.isArray(body.cptCodes) ? body.cptCodes.map((c) => String(c)).filter(Boolean) : [];

  const session = await insertSession({
    clinicianId: me.id,
    createdBy: me.id,
    clientFirst,
    clientLast,
    insurerId: body.insurerId ? String(body.insurerId) : null,
    dateOfService,
    cptCodes,
    durationHours: Number(body.durationHours) || 0,
    totalCost,
    copayCollected: Number(body.copayCollected) || 0,
    notes: typeof body.notes === "string" ? body.notes : "",
  });

  return NextResponse.json({ ok: true, id: session.id });
}
