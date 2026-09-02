import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { billingRoleOf, isBiller } from "@/lib/billingRole";
import { insertSession, listSessions, listInsurers, listExternalClinicians } from "@/lib/billing";
import { CLINICIANS } from "@/lib/clinicians";
import { parseCsv, buildRows, dupeKey, type DateOrder } from "@/lib/billingImport";
import { logChange } from "@/lib/db";

// Bulk import of past work. Takes the raw CSV rather than parsed rows, so the
// server does its own parsing and validation instead of trusting the browser.
export async function POST(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isBiller(billingRoleOf(me))) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const csv = String(body.csv ?? "");
  if (!csv.trim()) return NextResponse.json({ error: "Nothing to import." }, { status: 400 });
  const dateOrder = (["auto", "ymd", "dmy", "mdy"].includes(String(body.dateOrder)) ? body.dateOrder : "auto") as DateOrder;

  const [insurers, external, existing] = await Promise.all([listInsurers(), listExternalClinicians(), listSessions()]);
  const clinicians = [
    ...CLINICIANS.map((c) => ({ id: c.id, name: c.name })),
    ...external.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name })),
  ];

  const rows = buildRows(parseCsv(csv), clinicians, insurers.map((i) => ({ id: i.id, name: i.name })), dateOrder);
  if (rows.length === 0) return NextResponse.json({ error: "No rows found. Is the header row present?" }, { status: 400 });

  const seen = new Set(existing.map((s) => dupeKey({
    clinicianId: s.clinicianId, clientFirst: s.clientFirst ?? "", clientLast: s.clientLast ?? "",
    dateOfService: s.dateOfService, totalCost: s.totalCost,
  })));

  let imported = 0, duplicates = 0;
  const failed = rows.filter((r) => r.errors.length > 0).length;

  for (const r of rows) {
    if (r.errors.length > 0) continue;
    const k = dupeKey(r);
    if (seen.has(k)) { duplicates++; continue; }
    seen.add(k);
    await insertSession({
      clinicianId: r.clinicianId,
      createdBy: me.id,
      clientFirst: r.clientFirst,
      clientLast: r.clientLast,
      insurerId: r.insurerId,
      dateOfService: r.dateOfService,
      cptCodes: [],
      durationHours: 0,
      totalCost: r.totalCost,
      copayCollected: r.copayCollected,
      notes: r.notes,
      insurancePaid: r.insurancePaid,
      paidDate: r.paidDate,
    });
    imported++;
  }

  await logChange(me.id, "import", "create", `imported ${imported} charge(s) from CSV (${duplicates} dup, ${failed} failed)`);
  return NextResponse.json({ ok: true, imported, duplicates, failed, total: rows.length });
}
