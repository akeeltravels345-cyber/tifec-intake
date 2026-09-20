import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { CLINICIANS, getClinician } from "@/lib/clinicians";
import { listAppointmentTypes, availableSlots, createAppointment, updateAppointment, utcFromCayMinutes, type QuestionAnswer } from "@/lib/scheduling";
import { createVideoLink } from "@/lib/videoConnections";
import { assessClientIntake, intakeLinkPath, formShortLabel } from "@/lib/intakeRouting";
import { sendClientEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const PREVIEW = "peek";
const bookable = () => CLINICIANS.filter((c) => !c.intakeHidden && c.contact !== "biller");
const clean = (v: unknown, cap = 200) => String(v ?? "").trim().slice(0, cap);
const firstNameOf = (full: string) => full.trim().split(/\s+/)[0] || "there";

// Email the client their outstanding intake link(s). Best-effort: dev logs
// instead of sending, and a send failure never blocks the booking.
async function sendIntakeInvite(args: {
  origin: string; to: string; clientName: string; clinicianId: string; clinicianName: string;
  forms: { form: string; url: string }[];
}): Promise<void> {
  if (args.forms.length === 0) return;
  const lines = args.forms.map((f) => `${formShortLabel(f.form as never)}:\n${f.url}`).join("\n\n");
  const text =
    `Hi ${firstNameOf(args.clientName)},\n\n` +
    `Thank you for booking with The Institute for Essential Care. Before your appointment with ${args.clinicianName}, please complete the following so we're ready for you:\n\n` +
    `${lines}\n\n` +
    `Each form takes a few minutes and is kept confidential. If you have any trouble, just reply to this email.\n\n` +
    `Warmly,\nThe Institute for Essential Care`;
  try { await sendClientEmail(args.to, "Your intake forms for The Institute for Essential Care", text); }
  catch { /* never block a booking on email */ }
}

// Cayman is a fixed UTC-5 (no DST), so shift the instant and read it as UTC.
const CAY_OFFSET_MS = 5 * 3600 * 1000;
function caymanWhen(iso: string): string {
  const d = new Date(Date.parse(iso) - CAY_OFFSET_MS);
  const date = d.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" });
  return `${date} at ${time} (Cayman time)`;
}

// "You're booked" confirmation, sent to the client on a successful booking.
async function sendBookingConfirmation(args: {
  to: string; clientName: string; serviceName: string; clinicianName: string;
  whenText: string; mode: string; locationOrLink: string; manageUrl: string; intakeForms: string[];
}): Promise<void> {
  const isLink = /^https?:\/\//.test(args.locationOrLink);
  const where = args.mode === "virtual"
    ? (isLink ? `Video link:  ${args.locationOrLink}` : "Location:    Online (your video link will follow by email)")
    : `Location:    ${args.locationOrLink || "The Institute for Essential Care"}`;
  const intakeLine = args.intakeForms.length
    ? `\nWe've also emailed your ${args.intakeForms.join(" and ")} to complete before your visit, so we're ready for you.\n`
    : "";
  const text =
    `Hi ${firstNameOf(args.clientName)},\n\n` +
    `You're booked. Here are the details:\n\n` +
    `Service:     ${args.serviceName}\n` +
    `Clinician:   ${args.clinicianName}\n` +
    `When:        ${args.whenText}\n` +
    `${where}\n` +
    intakeLine +
    `\nNeed to change or cancel? Manage your booking here:\n${args.manageUrl}\n\n` +
    `We look forward to seeing you.\n\n` +
    `Warmly,\nThe Institute for Essential Care`;
  try { await sendClientEmail(args.to, "You're booked with The Institute for Essential Care", text); }
  catch { /* never block a booking on email */ }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  if (body.preview !== PREVIEW) return NextResponse.json({ error: "Not available." }, { status: 403 });

  const typeId = clean(body.typeId, 64);
  const clinicianId = clean(body.clinicianId, 64);
  const date = clean(body.date, 10);
  const minute = Number(body.minute);
  const name = clean(body.name, 120);
  const email = clean(body.email, 160);
  const phone = clean(body.phone, 40);

  if (!name) return NextResponse.json({ error: "Please give your name." }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Please give a valid email." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(minute)) return NextResponse.json({ error: "Pick a time." }, { status: 400 });

  const type = (await listAppointmentTypes()).find((t) => t.id === typeId && t.active);
  if (!type) return NextResponse.json({ error: "That service is unavailable." }, { status: 404 });
  if (!bookable().some((c) => c.id === clinicianId)) return NextResponse.json({ error: "That clinician is unavailable." }, { status: 404 });

  // Re-check the slot is still free, so two people can't grab the same time.
  const free = await availableSlots(clinicianId, date, type.durationMin, Date.now(), type.bufferBeforeMin, type.bufferAfterMin);
  if (!free.includes(minute)) return NextResponse.json({ error: "Sorry, that time was just taken. Please pick another." }, { status: 409 });

  // Custom booking questions: validate the required ones and record answers.
  const ansMap = (body.answers && typeof body.answers === "object") ? (body.answers as Record<string, unknown>) : {};
  const missing = type.questions.find((q) => q.required && !clean(ansMap[q.id], 1000));
  if (missing) return NextResponse.json({ error: `Please answer: ${missing.label}` }, { status: 400 });
  const answers: QuestionAnswer[] = type.questions
    .map((q) => ({ questionId: q.id, label: q.label, value: clean(ansMap[q.id], 1000) }))
    .filter((a) => a.value);

  const startAt = utcFromCayMinutes(date, minute);
  const endAt = utcFromCayMinutes(date, minute + type.durationMin);
  const path = body.insurancePath === "insurance" ? "insurance" : "self_pay";
  // For an "either" service the client picks; otherwise the service dictates.
  const mode = type.mode === "either" ? (body.mode === "virtual" ? "virtual" : "in_person") : type.mode;

  // New-client intake: which forms this service needs and whether the client
  // already has them on file (matched by name). Couples/Marriage/Pre-Marital
  // get the couples intake; other services get General + DSM-5; the free
  // consultation needs none. If the client tells us they're new, treat every
  // required form as outstanding even if a same-name match exists.
  const assessment = await assessClientIntake(name, type.name);
  const firstVisit = body.firstVisit === true;
  const missingForms = firstVisit && assessment.requiredForms.length > 0 ? assessment.requiredForms : assessment.missingForms;
  const needsIntake = assessment.requiredForms.length > 0 && missingForms.length > 0;
  const intakeStatus = assessment.requiredForms.length === 0 ? "not_required" : (needsIntake ? "pending" : "received");

  let appt = await createAppointment({
    kind: "appointment", clientName: name, clientEmail: email, clinicianId, typeId: type.id,
    startAt, endAt, mode, status: "booked", source: "client",
    insurancePath: path, insurerId: path === "insurance" ? clean(body.insurerId, 64) || null : null,
    policyNo: path === "insurance" ? clean(body.policyNo, 60) : "",
    intakeStatus,
    answers,
    notes: [phone ? `Phone: ${phone}` : "", clean(body.notes, 500)].filter(Boolean).join(" · "),
  } as never);

  const origin = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const clinicianName = getClinician(clinicianId)?.name || "your clinician";

  // Auto-email the outstanding intake link(s) to a new (or not-yet-completed)
  // client. One couple id ties both partners' couples submissions together.
  if (needsIntake) {
    const coupleId = missingForms.includes("couples") ? randomBytes(6).toString("hex") : undefined;
    const forms = missingForms.map((form) => ({ form, url: `${origin}${intakeLinkPath(clinicianId, form, coupleId)}` }));
    await sendIntakeInvite({ origin, to: email, clientName: name, clinicianId, clinicianName, forms });
  }

  // Auto video link for a virtual booking, on the clinician's own connected
  // account (best-effort; never blocks). Done before the confirmation so the
  // join link can be included in it.
  if (mode === "virtual" && !appt.locationOrLink) {
    const link = await createVideoLink(clinicianId, { topic: `TIFEC session - ${name}`, startAtISO: startAt, durationMin: type.durationMin });
    if (link) appt = (await updateAppointment(appt.id, { locationOrLink: link.url, videoEventId: link.ref || null })) || appt;
  }

  // "You're booked" confirmation (the piece the done screen has always promised).
  await sendBookingConfirmation({
    to: email, clientName: name, serviceName: type.name, clinicianName,
    whenText: caymanWhen(appt.startAt), mode, locationOrLink: appt.locationOrLink,
    manageUrl: `${origin}/book/manage?preview=${PREVIEW}&id=${appt.id}`,
    intakeForms: needsIntake ? missingForms.map((f) => formShortLabel(f)) : [],
  });

  return NextResponse.json({
    ok: true,
    appointment: { id: appt.id, startAt: appt.startAt, endAt: appt.endAt },
    intakeSent: needsIntake ? missingForms.map((f) => formShortLabel(f)) : [],
  });
}
