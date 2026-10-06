import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin, getClinician, type Clinician } from "@/lib/clinicians";
import { getAppointment, listAppointmentTypes, updateAppointment } from "@/lib/scheduling";
import { sendIntakeInvite } from "@/lib/bookingCore";
import { intakeLinkPath } from "@/lib/intakeRouting";
import { FORM_TEMPLATES, type FormTemplateKey } from "@/lib/forms";
import { caymanWhen } from "@/lib/caymanTime";

export const dynamic = "force-dynamic";

const seesAll = (c: Clinician) => isSystemAdmin(c) || c.contact === "owner" || c.id === "donnet-oconnor";
const isTreating = (c: Clinician) => !!c.test || (!c.intakeHidden && c.contact !== "biller" && c.contact !== "admin");

// Manually send one or more intake forms to an appointment's client — e.g. for
// appointments imported from Acuity (which come in marked "not required") that
// actually need intake. Picks the form(s) explicitly, emails the secure links,
// and marks the appointment's intake as pending so it's tracked.
export async function POST(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const me = user.clinician;
  const all = seesAll(me);
  if (!all && !isTreating(me)) return NextResponse.json({ error: "Not permitted." }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const id = String(body.id || "");
  const requested = Array.isArray(body.forms) ? body.forms.map(String) : (body.form ? [String(body.form)] : []);

  const a = await getAppointment(id);
  if (!a || a.kind !== "appointment") return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
  if (!all && a.clinicianId !== me.id) return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  if (!a.clientEmail) return NextResponse.json({ error: "This client has no email on file." }, { status: 400 });

  const validKeys = new Set<string>(Object.values(FORM_TEMPLATES).map((f) => f.key));
  const forms = requested.filter((k) => validKeys.has(k)) as FormTemplateKey[];
  if (!forms.length) return NextResponse.json({ error: "Choose at least one intake form to send." }, { status: 400 });

  const origin = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const type = (await listAppointmentTypes()).find((t) => t.id === a.typeId);
  const coupleId = forms.includes("couples" as FormTemplateKey) ? (a.coupleId || randomBytes(6).toString("hex")) : undefined;

  await sendIntakeInvite({
    to: a.clientEmail, clientName: a.clientName,
    clinicianName: getClinician(a.clinicianId)?.name || "your clinician",
    serviceName: type?.name || "appointment", whenText: caymanWhen(a.startAt),
    forms: forms.map((f) => ({ form: f, url: `${origin}${intakeLinkPath(a.clinicianId, f, f === ("couples" as FormTemplateKey) ? coupleId : undefined)}` })),
  });
  await updateAppointment(id, { intakeStatus: "pending", ...(coupleId ? { coupleId } : {}) } as never);

  return NextResponse.json({ ok: true, sent: forms.length });
}
