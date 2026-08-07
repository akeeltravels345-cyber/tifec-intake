import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { billingRoleOf, canMarkBilled } from "@/lib/billingRole";
import { getSession, deleteSession, updateSession } from "@/lib/billing";

const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Edit a logged charge — fix a mistake (wrong date, amount, insurer, co-pay, or
// status). Unspecified fields keep their current value. Same access rule as
// delete: the clinician who logged it, or the biller/owner.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const session = await getSession(id);
  if (!session) return NextResponse.json({ error: "Charge not found." }, { status: 404 });
  const allowed = canMarkBilled(billingRoleOf(me)) || session.clinicianId === me.id || session.createdBy === me.id;
  if (!allowed) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const dateOfService = isDate(body.dateOfService) ? String(body.dateOfService) : session.dateOfService;
  const totalCost = Number.isFinite(Number(body.totalCost)) && Number(body.totalCost) >= 0 ? Number(body.totalCost) : session.totalCost;
  const insurerId = body.insurerId !== undefined ? (body.insurerId ? String(body.insurerId) : null) : session.insurerId;
  const copayCollected = Number.isFinite(Number(body.copayCollected)) && Number(body.copayCollected) >= 0 ? Number(body.copayCollected) : session.copayCollected;
  const copayDue = Number.isFinite(Number(body.copayDue)) && Number(body.copayDue) >= 0 ? Number(body.copayDue) : session.copayDue;
  const notes = typeof body.notes === "string" ? body.notes : session.notes;

  // Stage: to bill -> awaiting (billed) -> paid, or settled with an adjustment
  // (contractual write-off / write-down). Derive the lifecycle dates so the
  // states stay consistent (paid/adjusted imply billed).
  const curStage = !insurerId ? "paid" : session.insuranceDisposition ? session.insuranceDisposition : session.insurancePaid ? "paid" : session.billedDate ? "awaiting" : "tobill";
  const stage = ["tobill", "awaiting", "paid", "writeoff", "writedown"].includes(String(body.stage)) ? String(body.stage) : curStage;
  const adjusted = insurerId ? (stage === "writeoff" || stage === "writedown") : false;
  const paid = stage === "paid";
  const settled = paid || adjusted; // off the outstanding list, has a settle date
  const insuranceDisposition = adjusted ? (stage as "writeoff" | "writedown") : null;
  // For an adjustment, the cash actually collected (the rest is the write-off/down).
  const insuranceCollected = adjusted
    ? (Number.isFinite(Number(body.insuranceCollected)) ? Math.max(0, Number(body.insuranceCollected)) : 0)
    : null;
  // Explicit billed/paid dates can be supplied (e.g. the biller back-dating from
  // a client record); otherwise keep the existing date, or fall back to the DOS.
  const bodyBilled = isDate(body.billedDate) ? String(body.billedDate) : null;
  const bodyPaid = isDate(body.paidDate) ? String(body.paidDate) : null;
  const billedDate = stage === "tobill" ? null : (bodyBilled ?? session.billedDate ?? dateOfService);
  const paidDate = settled ? (bodyPaid ?? session.paidDate ?? dateOfService) : null;
  // Uncollected-amount disposition: self-pay owing/waived, or an insured co-pay
  // waived (write-off). Anything else is null (collected / didn't-collect-owed).
  const selfPayStatus = insurerId
    ? (body.selfPayStatus === "waived" ? "waived" : null)
    : (body.selfPayStatus === "owing" || body.selfPayStatus === "waived" ? body.selfPayStatus : null);

  // Service (CPT) codes: only replace them when a valid non-empty list is sent;
  // otherwise leave the existing codes untouched.
  const cptCodes = Array.isArray(body.cptCodes)
    ? body.cptCodes.map((c) => String(c).trim()).filter(Boolean)
    : undefined;

  const ok = await updateSession(id, { dateOfService, insurerId, totalCost, copayCollected, copayDue, selfPayStatus, billedDate, insurancePaid: paid, paidDate, insuranceDisposition, insuranceCollected, notes, ...(cptCodes && cptCodes.length ? { cptCodes } : {}) });
  if (!ok) return NextResponse.json({ error: "Could not save the change." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Delete a single charge (one logged session / date of service). Because the
// queue, dashboards, payouts and commission are all computed live from the
// sessions, removing one here removes it from every view automatically; the CPT
// links are cleaned up inside deleteSession.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const session = await getSession(id);
  if (!session) return NextResponse.json({ error: "Charge not found." }, { status: 404 });

  // Biller/owner can delete any charge; a clinician only their own.
  const allowed = canMarkBilled(billingRoleOf(me)) || session.clinicianId === me.id || session.createdBy === me.id;
  if (!allowed) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const ok = await deleteSession(id);
  if (!ok) return NextResponse.json({ error: "Charge not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
