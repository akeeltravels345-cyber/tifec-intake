import { NextResponse } from "next/server";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin, type Clinician } from "@/lib/clinicians";
import { getAppointment } from "@/lib/scheduling";
import { sendIntakeReminderFor } from "@/lib/intakeReminders";

export const dynamic = "force-dynamic";

const seesAll = (c: Clinician) => isSystemAdmin(c) || c.contact === "owner" || c.id === "donnet-oconnor";
const isTreating = (c: Clinician) => !!c.test || (!c.intakeHidden && c.contact !== "biller" && c.contact !== "admin");

// A clinician (or owner/admin) sends an intake reminder by hand from the gating
// page. Clinicians may only nudge their own clients.
export async function POST(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const me = user.clinician;
  const all = seesAll(me);
  if (!all && !isTreating(me)) return NextResponse.json({ error: "Not permitted." }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const id = String(body.id || "");
  const a = await getAppointment(id);
  if (!a || a.kind !== "appointment") return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
  if (!all && a.clinicianId !== me.id) return NextResponse.json({ error: "Not permitted." }, { status: 403 });

  const origin = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const result = await sendIntakeReminderFor(id, { origin, force: true });
  const okStatuses = ["sent", "received"];
  return NextResponse.json({ ok: okStatuses.includes(result), result });
}
