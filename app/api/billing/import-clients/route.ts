import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { billingRoleOf, isBiller } from "@/lib/billingRole";
import { CLINICIANS, getClinician } from "@/lib/clinicians";
import { listInsurers, listSessions, insertSession } from "@/lib/billing";
import { insurancePortion } from "@/lib/billingCalc";
import { addClients } from "@/lib/clients";
import { parseArReport, matchInsurer } from "@/lib/arReport";

export const runtime = "nodejs"; // pdf parsing needs node
export const dynamic = "force-dynamic";

/** Pull text out of an uploaded PDF, server-side. */
async function pdfText(buf: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const res = await new PDFParse({ data: new Uint8Array(buf) }).getText();
  return res.text ?? "";
}

// Importing a client roster on behalf of a clinician is the biller's job.
export async function POST(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isBiller(billingRoleOf(me))) return NextResponse.json({ error: "Only the biller can import a client roster." }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = form.get("file");
  const clinicianId = String(form.get("clinicianId") ?? "");
  const commit = String(form.get("commit") ?? "") === "1";

  // The clinician the clients belong to must be a real, practising one — never
  // the biller himself or the hidden admin account, or clients would land in
  // the wrong roster.
  const clinician = getClinician(clinicianId);
  if (!clinician || clinician.intakeHidden || clinician.billing === "biller") {
    return NextResponse.json({ error: "Pick the clinician these clients belong to." }, { status: 400 });
  }
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach the PDF report." }, { status: 400 });
  if (file.size > 12 * 1024 * 1024) return NextResponse.json({ error: "That file is too large." }, { status: 400 });

  let text: string;
  try {
    text = await pdfText(Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: "Could not read that PDF. Is it the payment report export?" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const parsed = parseArReport(text);
  if (parsed.clients.length === 0) {
    return NextResponse.json({ error: "No clients found in that PDF. Check it's the right report." }, { status: 400 });
  }

  const insurers = (await listInsurers()).map((i) => ({ id: i.id, name: i.name }));
  const isAr = parsed.kind === "ar";
  const rows = parsed.clients.map((c) => {
    const ins = matchInsurer(c.insurerName, insurers);
    return {
      first: c.first, last: c.last,
      insurerId: ins?.id ?? null,
      insurerName: c.insurerName,
      insurerMatched: !c.insurerName || !!ins, // self-pay counts as fine
      outstanding: c.outstanding ?? 0,
      invoiceDate: c.invoiceDate ?? null,
    };
  });
  const owedTotal = Math.round(rows.reduce((t, r) => t + r.outstanding, 0) * 100) / 100;

  // Preview pass: show what was found without writing anything.
  if (!commit) {
    return NextResponse.json({
      ok: true,
      preview: true,
      kind: parsed.kind,
      providerName: parsed.providerName,
      forClinician: clinician.name,
      clients: rows,
      owedTotal: isAr ? owedTotal : 0,
    });
  }

  const { added, duplicates } = await addClients(clinicianId, rows.map((r) => ({ first: r.first, last: r.last, insurerId: r.insurerId })));

  // For a true AR report, also put the outstanding balance into the biller's
  // queue as one unpaid claim per client — deduped against what's already there
  // so re-importing the same report can't double the amounts.
  let claimsAdded = 0, claimsSkipped = 0;
  if (isAr) {
    const existing = await listSessions({ clinicianId });
    const seen = new Set(existing.map((s) =>
      `${`${s.clientFirst}|${s.clientLast}`.toLowerCase().trim()}@${s.dateOfService}@${insurancePortion(s)}`));
    for (const r of rows) {
      if (r.outstanding <= 0 || !r.insurerId) continue; // insured, owed money only
      const dos = r.invoiceDate ?? today;
      const key = `${`${r.first}|${r.last}`.toLowerCase().trim()}@${dos}@${r.outstanding}`;
      if (seen.has(key)) { claimsSkipped++; continue; }
      seen.add(key);
      await insertSession({
        clinicianId, createdBy: me.id, clientFirst: r.first, clientLast: r.last,
        insurerId: r.insurerId, dateOfService: dos, cptCodes: [], durationHours: 0,
        totalCost: r.outstanding, copayCollected: 0,
        notes: "Imported from AR report — outstanding balance", insurancePaid: false, paidDate: null,
      });
      claimsAdded++;
    }
  }

  return NextResponse.json({
    ok: true, added, duplicates, total: rows.length, forClinician: clinician.name,
    kind: parsed.kind, owedTotal: isAr ? owedTotal : 0, claimsAdded, claimsSkipped,
  });
}

// The clinicians a roster can be imported for (excludes the biller + hidden).
export async function GET() {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({
    clinicians: CLINICIANS.filter((c) => !c.intakeHidden && c.billing !== "biller").map((c) => ({ id: c.id, name: c.name })),
  });
}
