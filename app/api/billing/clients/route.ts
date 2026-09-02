import { NextResponse } from "next/server";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { resolveClient } from "@/lib/clients";
import { getClinician, canTreatClients } from "@/lib/clinicians";
import { isExternalId, listExternalClinicians } from "@/lib/billing";
import { logChange } from "@/lib/db";

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Create a client on behalf of a clinician. The biller (or owner/admin) picks
// which clinician the client belongs to; the client is linked to that clinician
// exactly as if they had logged the first session, so it lands in their book and
// dedups against existing records the same way.
export async function POST(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const isAdmin = user.clinician.contact === "admin";
  if (!isBiller(user.role) && !isOwner(user.role) && !isAdmin) {
    return NextResponse.json({ error: "Only the biller, owner or admin can add a client for a clinician." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const clinicianId = String(body.clinicianId ?? "");
  const first = String(body.first ?? "").trim();
  const last = String(body.last ?? "").trim();
  const insurerId = body.insurerId ? String(body.insurerId) : null;
  const dob = body.dob && isDate(String(body.dob)) ? String(body.dob) : undefined;

  if (!first || !last) return NextResponse.json({ error: "Enter the client's first and last name." }, { status: 400 });

  // The clinician must be a real treating provider (a regular clinician, or a
  // practicum biller like Nick who treats unpaid practicum clients), or a
  // registered external provider — never the admin or a non-treating biller.
  const internal = getClinician(clinicianId);
  const isTreatingInternal = canTreatClients(internal);
  const isExternal = isExternalId(clinicianId) && (await listExternalClinicians()).some((c) => c.id === clinicianId);
  if (!isTreatingInternal && !isExternal) {
    return NextResponse.json({ error: "Pick a clinician to assign this client to." }, { status: 400 });
  }

  const clientId = await resolveClient(clinicianId, { first, last, insurerId, profile: dob ? { dob } : {} });
  await logChange(user.clinician.id, `client:${clientId}`, "create", "created client record");
  return NextResponse.json({ ok: true, clientId });
}
