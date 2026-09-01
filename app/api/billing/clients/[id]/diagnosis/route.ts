import { NextResponse } from "next/server";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { getClient, clinicianSeesClient, setClientDiagnoses } from "@/lib/clients";
import { isSystemAdmin } from "@/lib/clinicians";

export const dynamic = "force-dynamic";

// Set a client's ICD-10 diagnoses. Editable by anyone who can see the client
// (clinician on the record, biller, owner, or admin) — every add/remove is
// recorded in the client's diagnosis audit log with who and when.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const client = await getClient(id);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const seesAll = isBiller(user.role) || isOwner(user.role) || isSystemAdmin(user.clinician);
  if (!seesAll && !(await clinicianSeesClient(id, user.clinician.id))) {
    return NextResponse.json({ error: "Not your client." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const codes = Array.isArray(body.codes) ? body.codes.map((c) => String(c).trim()).filter(Boolean).slice(0, 12) : null;
  if (!codes) return NextResponse.json({ error: "Send the diagnosis codes." }, { status: 400 });

  const updated = await setClientDiagnoses(id, codes, user.clinician.id, user.clinician.name);
  if (!updated) return NextResponse.json({ error: "Could not save." }, { status: 500 });
  return NextResponse.json({ ok: true, diagnosis: updated.profile.diagnosis ?? [], diagnosisLog: updated.profile.diagnosisLog ?? [] });
}
