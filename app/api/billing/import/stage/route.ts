import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getBillingUser, canMarkBilled } from "@/lib/billingRole";
import { addStagedBatch, listStaged, getStaged, updateStaged, setStagedStatus, type StagedInput } from "@/lib/importStaging";
import { resolveClient } from "@/lib/clients";
import { insertSession, listCptCodes } from "@/lib/billing";

export const runtime = "nodejs";

function allowed(user: Awaited<ReturnType<typeof getBillingUser>>): boolean {
  return !!user && (canMarkBilled(user.role) || user.clinician.contact === "admin");
}

const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!allowed(user)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const action = String(body.action ?? "");

  // Load the bundled PRC batch into the review queue. Idempotent per RECORD, not
  // per batch — so re-loading after a partial/older load tops up only the records
  // that aren't already staged (e.g. the travel-time rows added later), without
  // touching or duplicating ones already staged or accepted.
  if (action === "load") {
    const batch = "prc-latty-2026-08";
    let data: { records: Record<string, unknown>[] };
    try {
      data = JSON.parse(fs.readFileSync(path.join(process.cwd(), "db", "prc-latty-batch.json"), "utf8"));
    } catch {
      return NextResponse.json({ error: "Batch file not found." }, { status: 500 });
    }
    const cpts = await listCptCodes();
    const hrsFor = (code: string) => cpts.find((c) => c.code === code)?.hrs ?? 1;
    const key = (r: { clientFirst: string; clientLast: string; cpt: string; dateOfService: string; invNo: string; fee: number }) =>
      `${r.clientLast}|${r.clientFirst}|${r.cpt}|${r.dateOfService}|${r.invNo}|${r.fee}`;
    const have = new Set((await listStaged()).filter((e) => e.batch === batch).map(key));
    const rows: StagedInput[] = data.records.map((r) => ({
      clinicianId: "joan-latty",
      clientFirst: String(r.clientFirst ?? ""), clientLast: String(r.clientLast ?? ""),
      dob: String(r.dob ?? ""), insurerName: String(r.insurerName ?? ""),
      cpt: String(r.cpt ?? ""), fee: Number(r.fee ?? 0), durationHours: hrsFor(String(r.cpt ?? "")),
      dateOfService: String(r.dateOfService ?? ""), billedDate: String(r.billedDate ?? ""), invNo: String(r.invNo ?? ""),
    })).filter((r) => !have.has(key(r)));
    if (!rows.length) return NextResponse.json({ ok: true, already: true, loaded: 0 });
    const n = await addStagedBatch(batch, rows, new Date().toISOString());
    return NextResponse.json({ ok: true, loaded: n });
  }

  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  if (action === "reject") {
    const ok = await setStagedStatus(id, "rejected");
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Accept: turn a staged row into a real client + billing session (billed,
  // awaiting insurer payment), then mark it accepted.
  if (action === "accept") {
    const rec = await getStaged(id);
    if (!rec) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (rec.status === "accepted") return NextResponse.json({ ok: true, already: true });
    const insurerId = body.insurerId ? String(body.insurerId) : null;
    if (!insurerId) return NextResponse.json({ error: "Pick the insurer before accepting." }, { status: 400 });
    if (!rec.clientFirst.trim() && !rec.clientLast.trim()) return NextResponse.json({ error: "This record has no client name." }, { status: 400 });
    if (!isDate(rec.dateOfService)) return NextResponse.json({ error: "This record needs a valid date of service." }, { status: 400 });

    const clientId = await resolveClient(rec.clinicianId, {
      first: rec.clientFirst.trim(), last: rec.clientLast.trim(), insurerId,
      profile: rec.dob ? { dob: rec.dob } : undefined,
    });
    await insertSession({
      clinicianId: rec.clinicianId, clientFirst: rec.clientFirst.trim(), clientLast: rec.clientLast.trim(),
      clientId, insurerId, dateOfService: rec.dateOfService, cptCodes: rec.cpt ? [rec.cpt] : [],
      durationHours: rec.durationHours || 1, totalCost: rec.fee, copayCollected: 0, copayDue: 0,
      billedDate: isDate(rec.billedDate) ? rec.billedDate : rec.dateOfService, insurancePaid: false,
      notes: rec.invNo ? `Imported from PRC report · inv #${rec.invNo}` : "Imported from PRC report",
      createdBy: user.clinician.id,
    });
    await setStagedStatus(id, "accepted");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

// Edit a staged record before accepting it.
export async function PATCH(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!allowed(user)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const patch: Partial<StagedInput> = {};
  if (typeof body.clientFirst === "string") patch.clientFirst = body.clientFirst;
  if (typeof body.clientLast === "string") patch.clientLast = body.clientLast;
  if (typeof body.dob === "string") patch.dob = body.dob;
  if (typeof body.cpt === "string") patch.cpt = body.cpt;
  if (Number.isFinite(Number(body.fee))) patch.fee = Number(body.fee);
  if (isDate(body.dateOfService)) patch.dateOfService = String(body.dateOfService);
  if (typeof body.billedDate === "string") patch.billedDate = body.billedDate;
  if (typeof body.invNo === "string") patch.invNo = body.invNo;

  const ok = await updateStaged(id, patch);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found." }, { status: 404 });
}
