import { NextResponse } from "next/server";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { getClient, clinicianSeesClient, updateClient, type ClientProfile } from "@/lib/clients";

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

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
    diagnosis: Array.isArray(p.diagnosis) ? p.diagnosis.map((x) => String(x).trim().toUpperCase()).filter(Boolean).slice(0, 12) : undefined,
  };

  const insurerId = body.insurerId ? String(body.insurerId) : null;
  const updated = await updateClient(id, insurerId, profile);
  if (!updated) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
