import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { billingRoleOf, isBiller } from "@/lib/billingRole";
import { upsertExternalClinician, deleteExternalClinician } from "@/lib/billing";

// Outside clinicians are the biller's own private clients: his to manage, and
// deliberately not the owner's business. They never touch TIFEC's books.
export async function POST(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isBiller(billingRoleOf(me))) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (String(body.action ?? "save") === "delete") {
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "Missing clinician." }, { status: 400 });
    await deleteExternalClinician(id);
    return NextResponse.json({ ok: true });
  }

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "A clinician name is required." }, { status: 400 });

  const billerPct = Number(body.billerPct);
  if (isNaN(billerPct) || billerPct < 0 || billerPct > 100) {
    return NextResponse.json({ error: "Your rate must be between 0 and 100." }, { status: 400 });
  }

  const saved = await upsertExternalClinician({
    id: body.id ? String(body.id) : undefined,
    name,
    billerPct,
    active: body.active !== false,
  });
  return NextResponse.json({ ok: true, id: saved.id });
}
