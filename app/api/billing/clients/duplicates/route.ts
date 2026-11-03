import { NextResponse } from "next/server";
import { getBillingUser, canConfigureBilling } from "@/lib/billingRole";
import { findDuplicateGroups, type DuplicateRecord } from "@/lib/clients";
import { sessionCountsByClient, listInsurers } from "@/lib/billing";
import { getClinician } from "@/lib/clinicians";
import { mergeClients } from "@/lib/clientMerge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A record's "weight" — richer records make the better survivor.
const weight = (r: DuplicateRecord & { sessionCount: number }) =>
  r.sessionCount * 100 + r.docCount * 10 + r.noteCount * 5 + r.clinicianIds.length;

// Review: suspected duplicate groups with the session/doc/note counts the biller
// needs to choose which record to keep.
export async function GET() {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!canConfigureBilling(user.role)) return NextResponse.json({ error: "Not permitted." }, { status: 403 });

  const [groups, counts, insurers] = await Promise.all([findDuplicateGroups(), sessionCountsByClient(), listInsurers()]);
  const insurerName = (id: string | null) => (id ? insurers.find((i) => i.id === id)?.name ?? "" : "");

  const out = groups.map((g) => {
    const records = g.records.map((r) => ({
      ...r,
      sessionCount: counts.get(r.id) ?? 0,
      insurerName: insurerName(r.insurerId),
      clinicianNames: r.clinicianIds.map((cid) => getClinician(cid)?.name ?? cid),
    }));
    // Suggest keeping the richest record; tie-break on the oldest (earliest created).
    const suggested = [...records].sort((a, b) => weight(b) - weight(a) || a.createdAt.localeCompare(b.createdAt))[0];
    return { key: g.key, confidence: g.confidence, reason: g.reason, suggestedSurvivorId: suggested?.id ?? records[0]?.id, records };
  });

  return NextResponse.json({ ok: true, groups: out });
}

// Merge: fold the chosen duplicates into the survivor. Validated against a fresh
// detection so only records the system actually flags as the same person can be
// merged (the UI can't be coaxed into merging unrelated clients).
export async function POST(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!canConfigureBilling(user.role)) return NextResponse.json({ error: "Not permitted." }, { status: 403 });

  let body: { survivorId?: string; duplicateIds?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const survivorId = String(body.survivorId || "");
  const duplicateIds = Array.isArray(body.duplicateIds) ? body.duplicateIds.map(String).filter(Boolean) : [];
  if (!survivorId || !duplicateIds.length) return NextResponse.json({ error: "Choose a record to keep and at least one to merge." }, { status: 400 });

  // Safety: every id must sit inside ONE detected duplicate group.
  const groups = await findDuplicateGroups();
  const ids = new Set([survivorId, ...duplicateIds]);
  const group = groups.find((g) => g.records.some((r) => r.id === survivorId) && [...ids].every((id) => g.records.some((r) => r.id === id)));
  if (!group) return NextResponse.json({ error: "These records are no longer flagged as the same person. Reload and try again." }, { status: 409 });

  try {
    const result = await mergeClients(survivorId, duplicateIds, { id: user.clinician.id, name: user.clinician.name });
    return NextResponse.json(result);
  } catch (err) {
    console.error("client merge failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Merge failed." }, { status: 500 });
  }
}
