import { NextResponse } from "next/server";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import { getClient, clinicianSeesClient, setReferral } from "@/lib/clients";
import { REFERRAL_MONTH_OPTIONS, addMonths } from "@/lib/referral";
import { logChange } from "@/lib/db";

export const dynamic = "force-dynamic";

const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

// Add / update / clear a client's referral, edited inline on the record (no need
// to open "Edit details"). Biller / owner / admin, or a clinician linked to the
// client. The end date is computed from the start date + chosen length.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const client = await getClient(id);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  const seesAll = isBiller(user.role) || isOwner(user.role) || isSystemAdmin(user.clinician);
  if (!seesAll && !(await clinicianSeesClient(id, user.clinician.id))) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  // clear === true removes the referral entirely.
  if (body.clear === true) {
    await setReferral(id, null);
    await logChange(user.clinician.id, `client:${id}`, "edit", "cleared referral");
    return NextResponse.json({ ok: true, referral: null });
  }

  const startDate = isDate(body.startDate) ? String(body.startDate) : undefined;
  const months = REFERRAL_MONTH_OPTIONS.includes(Number(body.months) as never) ? Number(body.months) : undefined;
  const computedEnd = startDate && months ? addMonths(startDate, months) : undefined;
  const endDate = computedEnd || (isDate(body.endDate) ? String(body.endDate) : undefined);
  const sessions = Number.isFinite(Number(body.sessions)) && Number(body.sessions) > 0 ? Math.floor(Number(body.sessions)) : undefined;

  const referral = { source: s(body.source), startDate, months, endDate, sessions };
  const has = Object.values(referral).some((x) => x !== undefined);
  await setReferral(id, has ? referral : null);
  await logChange(user.clinician.id, `client:${id}`, "edit", has ? `set referral (until ${endDate ?? "?"})` : "cleared referral");
  return NextResponse.json({ ok: true, referral: has ? referral : null });
}
