import { NextResponse } from "next/server";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin, type Clinician } from "@/lib/clinicians";
import { getClinicianPrefs, setClinicianPrefs } from "@/lib/clinicianPrefs";

export const dynamic = "force-dynamic";

const seesAll = (c: Clinician) => isSystemAdmin(c) || c.contact === "owner" || c.id === "donnet-oconnor";
const isTreating = (c: Clinician) => !!c.test || (!c.intakeHidden && c.contact !== "biller" && c.contact !== "admin");

// A clinician reads/updates their OWN scheduling preferences (never anyone else's).
export async function POST(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const me = user.clinician;
  if (!seesAll(me) && !isTreating(me)) return NextResponse.json({ error: "Not permitted." }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const patch: { dailyAgenda?: boolean } = {};
  if (typeof body.dailyAgenda === "boolean") patch.dailyAgenda = body.dailyAgenda;
  const prefs = await setClinicianPrefs(me.id, patch);
  return NextResponse.json({ ok: true, prefs });
}
