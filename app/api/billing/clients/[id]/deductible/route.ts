import { NextResponse } from "next/server";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import { getClient, setDeductible, applyToDeductible, removeDeductibleApplied } from "@/lib/clients";
import { deductibleSummary } from "@/lib/deductible";
import { logChange } from "@/lib/db";

export const dynamic = "force-dynamic";

const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const money = (n: number) => `$${n.toFixed(2)}`;

// Manage a client's insurance deductible: the amount the insurer sets, and the
// sessions that draw it down as the patient pays out of pocket. Biller / owner /
// admin only. The deductible is a theoretical liability, never money we hold.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isBiller(user.role) && !isOwner(user.role) && !isSystemAdmin(user.clinician)) {
    return NextResponse.json({ error: "Only the biller, owner or admin can manage deductibles." }, { status: 403 });
  }

  const client = await getClient(id);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const action = String(body.action ?? "");

  let updated = client;
  if (action === "set-amount") {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: "Enter a valid deductible amount." }, { status: 400 });
    const year = Number.isFinite(Number(body.year)) ? Number(body.year) : new Date().getFullYear();
    updated = (await setDeductible(id, amount, year)) ?? client;
    await logChange(user.clinician.id, `client:${id}`, "edit", amount > 0 ? `set deductible to ${money(amount)} (${year})` : "cleared deductible");
  } else if (action === "apply") {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Enter the amount to apply." }, { status: 400 });
    const date = isDate(body.date) ? String(body.date) : new Date().toISOString().slice(0, 10);
    const res = await applyToDeductible(id, { sessionId: typeof body.sessionId === "string" ? body.sessionId : null, date, amount, note: typeof body.note === "string" ? body.note : undefined });
    if (!res) return NextResponse.json({ error: "Could not apply." }, { status: 500 });
    updated = res.client;
    if (res.applied <= 0) return NextResponse.json({ error: "The deductible is already met — nothing left to apply." }, { status: 400 });
    await logChange(user.clinician.id, `client:${id}`, "status", `applied ${money(res.applied)} to the deductible (${date})`);
  } else if (action === "remove") {
    const entryId = String(body.entryId ?? "");
    updated = (await removeDeductibleApplied(id, entryId)) ?? client;
    await logChange(user.clinician.id, `client:${id}`, "status", "removed a deductible draw-down");
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    deductible: updated.profile.deductible ?? null,
    applied: updated.profile.deductibleApplied ?? [],
    summary: deductibleSummary(updated.profile),
  });
}
