import { NextResponse } from "next/server";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { getClient, clinicianSeesClient } from "@/lib/clients";
import { insertSession } from "@/lib/billing";

const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Add one charge (appointment / date of service) to an existing client record —
// e.g. to itemise a bundled invoice into the individual sessions that make it up.
// The charge is attached directly to this client (clientId), attributed to one of
// the client's clinicians. It flows into the queue/dashboards like any other.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const client = await getClient(id);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const seesAll = isBiller(user.role) || isOwner(user.role);
  if (!seesAll && !(await clinicianSeesClient(id, user.clinician.id)))
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  // Attribute to one of the client's own clinicians (a non-owner/biller may only
  // add against themselves).
  const clinicianId = String(body.clinicianId ?? (seesAll ? client.clinicianIds[0] : user.clinician.id) ?? "");
  if (!clinicianId) return NextResponse.json({ error: "Pick which clinician saw them." }, { status: 400 });
  if (!seesAll && clinicianId !== user.clinician.id) return NextResponse.json({ error: "You can only add your own charges." }, { status: 403 });
  if (!client.clinicianIds.includes(clinicianId)) return NextResponse.json({ error: "That clinician isn't linked to this client." }, { status: 400 });

  const dateOfService = String(body.dateOfService ?? "");
  if (!isDate(dateOfService)) return NextResponse.json({ error: "A valid date of service is required." }, { status: 400 });
  const totalCost = Number(body.totalCost);
  if (isNaN(totalCost) || totalCost < 0) return NextResponse.json({ error: "Enter the charge amount." }, { status: 400 });

  const insurerId = body.insurerId ? String(body.insurerId) : client.insurerId;
  const cptCodes = Array.isArray(body.cptCodes) ? body.cptCodes.map((c) => String(c)).filter(Boolean) : [];
  const copayCollected = Number(body.copayCollected) || 0;

  // Stage: to bill (default) -> awaiting (billed, not paid) -> paid (collected).
  const stage = String(body.stage ?? "tobill");
  const billedDate = isDate(body.billedDate) ? String(body.billedDate) : (stage !== "tobill" ? dateOfService : null);
  const paid = stage === "paid";
  const paidDate = paid ? (isDate(body.paidDate) ? String(body.paidDate) : dateOfService) : null;

  const session = await insertSession({
    clinicianId, createdBy: user.clinician.id,
    clientFirst: client.first, clientLast: client.last, clientId: id,
    insurerId: insurerId ?? null, dateOfService, cptCodes,
    durationHours: Number(body.durationHours) || 0,
    totalCost, copayCollected,
    notes: typeof body.notes === "string" ? body.notes : "",
    billedDate, insurancePaid: paid, paidDate,
  });
  return NextResponse.json({ ok: true, id: session.id });
}
