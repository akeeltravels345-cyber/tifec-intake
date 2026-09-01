import { NextResponse } from "next/server";
import { caymanToday } from "@/lib/caymanTime";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { getClient, clinicianSeesClient, updateClient, deleteClient, type ClientProfile } from "@/lib/clients";
import { deleteDocFilesForClient } from "@/lib/clientDocs";
import { listSessions, deleteSession } from "@/lib/billing";

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function parseReferral(v: unknown): ClientProfile["referral"] {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  const sessions = Number(r.sessions);
  const out = {
    source: s(r.source), authNumber: s(r.authNumber),
    startDate: isDate(r.startDate) ? String(r.startDate) : undefined,
    endDate: isDate(r.endDate) ? String(r.endDate) : undefined,
    sessions: Number.isFinite(sessions) && sessions > 0 ? Math.floor(sessions) : undefined,
    notes: s(r.notes),
  };
  return Object.values(out).some((x) => x !== undefined) ? out : undefined;
}

function parseDocuments(v: unknown): ClientProfile["documents"] {
  if (!Array.isArray(v)) return undefined;
  const out = v.slice(0, 50).map((d) => {
    const doc = (d ?? {}) as Record<string, unknown>;
    const name = s(doc.name);
    if (!name) return null;
    const size = Number(doc.size);
    return {
      id: s(doc.id) ?? Math.random().toString(36).slice(2),
      name, kind: s(doc.kind) ?? "other", url: s(doc.url), note: s(doc.note),
      addedAt: isDate(doc.addedAt) ? String(doc.addedAt) : caymanToday(),
      // Preserve the uploaded-file markers so a record edit never orphans bytes.
      stored: doc.stored === true || undefined,
      mime: s(doc.mime),
      size: Number.isFinite(size) && size > 0 ? size : undefined,
    };
  }).filter(Boolean) as NonNullable<ClientProfile["documents"]>;
  return out.length ? out : undefined;
}

// Delete a whole client: their record, their clinician links, AND all of their
// charges — so nothing is orphaned. Every downstream view recomputes from what's
// left. Biller/owner only (a client can be shared across clinicians).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isBiller(user.role) && !isOwner(user.role)) return NextResponse.json({ error: "Only the biller or owner can delete a client." }, { status: 403 });

  const client = await getClient(id);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const sessions = await listSessions({ clientId: id });
  let removedCharges = 0;
  for (const sess of sessions) { if (await deleteSession(sess.id)) removedCharges++; }
  await deleteDocFilesForClient(id);
  await deleteClient(id);
  return NextResponse.json({ ok: true, removedCharges });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const client = await getClient(id);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  // Isolation: biller/owner edit anyone; a clinician only a client linked to them.
  const seesAll = isBiller(user.role) || isOwner(user.role);
  if (!seesAll && !(await clinicianSeesClient(id, user.clinician.id)))
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const p = (body.profile ?? {}) as Record<string, unknown>;
  const addr = (p.address ?? {}) as Record<string, unknown>;
  const insr = (p.insurance ?? {}) as Record<string, unknown>;

  // Rebuild the profile from validated primitives — never trust the blob wholesale.
  const rel = s(insr.relationship);
  const profile: ClientProfile = {
    dob: isDate(p.dob) ? String(p.dob) : undefined,
    sex: p.sex === "M" || p.sex === "F" || p.sex === "U" ? p.sex : undefined,
    phone: s(p.phone),
    address: (s(addr.line1) || s(addr.line2) || s(addr.city) || s(addr.region) || s(addr.postal) || s(addr.country))
      ? { line1: s(addr.line1), line2: s(addr.line2), city: s(addr.city), region: s(addr.region), postal: s(addr.postal), country: s(addr.country) }
      : undefined,
    insurance: (s(insr.memberId) || s(insr.groupNo) || s(insr.planName) || (rel && rel !== "self") || s(insr.insuredFirst) || s(insr.insuredLast) || s(insr.insuredDob))
      ? {
          memberId: s(insr.memberId), groupNo: s(insr.groupNo), planName: s(insr.planName),
          relationship: (rel === "spouse" || rel === "child" || rel === "other" ? rel : "self"),
          insuredFirst: s(insr.insuredFirst), insuredLast: s(insr.insuredLast),
          insuredDob: isDate(insr.insuredDob) ? String(insr.insuredDob) : undefined,
        }
      : undefined,
    // Diagnoses (and their audit log) are managed only through the /diagnosis
    // endpoint; never let a record edit wipe them or bypass the log.
    diagnosis: client.profile.diagnosis,
    diagnosisLog: client.profile.diagnosisLog,
    referral: parseReferral(p.referral),
    documents: parseDocuments(p.documents),
    // Shared notes are managed only through the /notes endpoint; never let a
    // record edit (which doesn't carry them) wipe the existing stream.
    notes: client.profile.notes,
    // Preserve the demo marker so editing a sample client doesn't make it
    // un-cleanable by the sample-data purge.
    sample: client.profile.sample || undefined,
  };

  const insurerId = body.insurerId ? String(body.insurerId) : null;
  const updated = await updateClient(id, insurerId, profile);
  if (!updated) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
