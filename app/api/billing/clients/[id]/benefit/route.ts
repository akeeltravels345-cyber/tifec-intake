import { NextResponse } from "next/server";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import { getClient, setBenefit } from "@/lib/clients";
import { logChange } from "@/lib/db";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toFixed(2)}`;

// Set a client's total insurance funds for a plan year — the pot each insured
// date of service draws down. Biller / owner / admin only. The remaining balance
// is computed from the sessions on the client record, so it isn't stored here.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isBiller(user.role) && !isOwner(user.role) && !isSystemAdmin(user.clinician)) {
    return NextResponse.json({ error: "Only the biller, owner or admin can set insurance funds." }, { status: 403 });
  }

  const client = await getClient(id);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: "Enter a valid amount." }, { status: 400 });
  const year = Number.isFinite(Number(body.year)) ? Number(body.year) : new Date().getFullYear();

  const updated = (await setBenefit(id, amount, year)) ?? client;
  await logChange(user.clinician.id, `client:${id}`, "edit", amount > 0 ? `set insurance funds to ${money(amount)} (${year})` : "cleared insurance funds");

  return NextResponse.json({ ok: true, benefit: updated.profile.benefit ?? null });
}
