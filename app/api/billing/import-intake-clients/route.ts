import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { isSystemAdmin, getClinician } from "@/lib/clinicians";
import { listClients, resolveClient, identityKeyOf } from "@/lib/clients";
import { listIntakeClientsForClinician } from "@/lib/intakeLink";
import { logChange } from "@/lib/db";

export const dynamic = "force-dynamic";

// Create no-charge billing client records from a PRACTICUM clinician's intake
// clients, so their unpaid caseload exists in the system (for session notes)
// without re-entering everyone. Admin only.
//
//   POST { clinicianId }               -> dry run: report what WOULD be created
//   POST { clinicianId, "apply": true } -> create the records, linked to them
//
// The records carry no charges, so they never appear in payouts or the billing
// queue. Idempotent: a client already on the clinician's book is skipped.
export async function POST(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isSystemAdmin(me)) return NextResponse.json({ error: "Admin only." }, { status: 403 });

  let body: { clinicianId?: string; apply?: boolean } = {};
  try { body = await req.json(); } catch { /* empty = dry run */ }
  const clinicianId = String(body.clinicianId ?? "");
  const apply = body.apply === true;

  const clinician = getClinician(clinicianId);
  if (!clinician || !clinician.practicum) {
    return NextResponse.json({ error: "Pick a practicum clinician." }, { status: 400 });
  }

  const [intakeClients, existing] = await Promise.all([
    listIntakeClientsForClinician(clinicianId),
    listClients(clinicianId),
  ]);
  // Identity keys already on this clinician's book, to skip anyone with a record.
  const have = new Set(existing.map((c) => identityKeyOf(c.first, c.last, c.profile.dob)));

  let created = 0, alreadyOnBook = 0;
  const toCreate: { name: string; dob?: string }[] = [];
  for (const ic of intakeClients) {
    if (have.has(identityKeyOf(ic.first, ic.last, ic.dob))) { alreadyOnBook++; continue; }
    toCreate.push({ name: `${ic.first} ${ic.last}`.trim(), dob: ic.dob });
    if (apply) {
      await resolveClient(clinicianId, { first: ic.first, last: ic.last, insurerId: null, profile: ic.dob ? { dob: ic.dob } : {} });
      created++;
    }
  }
  if (apply && created > 0) {
    await logChange(me.id, `clinician:${clinicianId}`, "create", `imported ${created} intake client(s) as no-charge records`);
  }

  return NextResponse.json({
    ok: true,
    apply,
    clinicianName: clinician.name,
    totals: { intake: intakeClients.length, alreadyOnBook, toCreate: toCreate.length, created },
    toCreate: toCreate.slice(0, 300),
  });
}
