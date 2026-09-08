import { NextResponse } from "next/server";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin, getClinician, type Clinician } from "@/lib/clinicians";
import { getAvailability, saveAvailability } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

// Scoped like the calendar: a treating clinician manages only their own hours;
// the owner, Donnet O'Connor and the admin manage everyone's.
const seesAll = (c: Clinician) => isSystemAdmin(c) || c.contact === "owner" || c.id === "donnet-oconnor";
const isTreating = (c: Clinician) => !c.intakeHidden && c.contact !== "biller" && c.contact !== "admin";

export async function GET(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const me = user.clinician;
  const all = seesAll(me);
  if (!all && !isTreating(me)) return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  const asked = new URL(req.url).searchParams.get("clinicianId") || "";
  const id = all ? asked : me.id; // clinicians are locked to their own hours
  if (!id) return NextResponse.json({ error: "Which clinician?" }, { status: 400 });
  return NextResponse.json({ availability: await getAvailability(id) });
}

export async function POST(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const me = user.clinician;
  const all = seesAll(me);
  if (!all && !isTreating(me)) return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const id = all ? String(body.clinicianId || "") : me.id; // a clinician can only save their own
  if (!id || !getClinician(id)) return NextResponse.json({ error: "Unknown clinician." }, { status: 400 });
  try {
    const availability = await saveAvailability(id, body as never);
    return NextResponse.json({ ok: true, availability });
  } catch (e) {
    console.error("save availability failed", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
