import { NextResponse } from "next/server";
import { caymanToday } from "@/lib/caymanTime";
import { getCurrentClinician } from "@/lib/auth";
import { billingRoleOf, isBiller } from "@/lib/billingRole";
import { CLINICIANS, getClinician } from "@/lib/clinicians";
import { listInsurers, listSessions, insertSession } from "@/lib/billing";
import { addClients } from "@/lib/clients";
import { parseArReport, matchInsurer } from "@/lib/arReport";

export const runtime = "nodejs"; // pdf parsing needs node
export const dynamic = "force-dynamic";

/** Pull text out of an uploaded PDF, server-side. Uses unpdf, which bundles a
 *  serverless-safe pdf.js build (pdf-parse's pdfjs failed on Vercel). */
async function pdfText(buf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : String(text ?? "");
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

  const today = caymanToday();
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
      dob: c.dob ?? null,
      insurerId: ins?.id ?? null,
      insurerName: c.insurerName,
      insurerMatched: !c.insurerName || !!ins, // self-pay counts as fine
      outstanding: c.outstanding ?? 0,
      invoiceDate: c.invoiceDate ?? null,
      invoices: c.invoices ?? [],
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

  // Create/link each client at the practice level (name + DOB dedup) and keep
  // the resolved client id per row so the imported claims link to the record.
  const { added, linked, duplicates, ids } = await addClients(
    clinicianId,
    rows.map((r) => ({ first: r.first, last: r.last, insurerId: r.insurerId, profile: r.dob ? { dob: r.dob } : {} })),
  );

  // For a true AR report, also put the outstanding balance into the biller's
  // queue. These were BILLED to the insurer (that's what an AR report is) but
  // not yet paid — so they land as billed/submitted, awaiting payment. Deduped
  // against what's already there so re-importing can't double the amounts.
  let claimsAdded = 0, claimsSkipped = 0;
  if (isAr) {
    // Dedup by COUNT, not presence: a client can genuinely have two identical
    // charges on one day (same code + fee), so those must both import; only skip
    // as many as already exist, which keeps a RE-import from doubling anything.
    const existing = await listSessions({ clinicianId });
    const keyOf = (first: string, last: string, dos: string, amount: number) =>
      `${`${first}|${last}`.toLowerCase().trim()}@${dos}@${amount}`;
    const budget = new Map<string, number>();
    for (const s of existing) { const k = keyOf(s.clientFirst, s.clientLast, s.dateOfService, s.totalCost); budget.set(k, (budget.get(k) ?? 0) + 1); }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.outstanding <= 0 || !r.insurerId) continue; // insured, owed money only
      // One charge per invoice line (each its own date of service). If the report
      // gave no per-line detail, fall back to a single charge for the total.
      const invoices = r.invoices.length ? r.invoices : [{ date: r.invoiceDate ?? today, amount: r.outstanding, code: undefined as string | undefined }];
      for (const inv of invoices) {
        const dos = inv.date || today;
        const k = keyOf(r.first, r.last, dos, inv.amount);
        const already = budget.get(k) ?? 0;
        if (already > 0) { budget.set(k, already - 1); claimsSkipped++; continue; } // already imported before
        await insertSession({
          clinicianId, createdBy: me.id, clientFirst: r.first, clientLast: r.last, clientId: ids[i],
          insurerId: r.insurerId, dateOfService: dos, cptCodes: inv.code ? [inv.code] : [], durationHours: 0,
          totalCost: inv.amount, copayCollected: 0,
          notes: "Imported from AR report — billed, awaiting payment",
          billedDate: dos, insurancePaid: false, paidDate: null,
        });
        claimsAdded++;
      }
    }
  }

  return NextResponse.json({
    ok: true, added: added + linked, duplicates, total: rows.length, forClinician: clinician.name,
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
