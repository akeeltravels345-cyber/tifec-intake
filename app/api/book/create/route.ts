import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { CLINICIANS, getClinician, isBookableClinician } from "@/lib/clinicians";
import { listAppointmentTypes, availableSlots, createAppointment, updateAppointment, utcFromCayMinutes, type QuestionAnswer } from "@/lib/scheduling";
import { createVideoLink, hasGoogleConnection, upsertGoogleEvent } from "@/lib/videoConnections";
import { assessClientIntake, intakeLinkPath, formShortLabel } from "@/lib/intakeRouting";
import { sendBrandedEmail } from "@/lib/email";
import { caymanWhen } from "@/lib/caymanTime";
import { appointmentInvite } from "@/lib/ical";

export const dynamic = "force-dynamic";

const PREVIEW = "peek";
const canBook = (id: string) => { const c = CLINICIANS.find((x) => x.id === id); return !!c && isBookableClinician(c); };
const clean = (v: unknown, cap = 200) => String(v ?? "").trim().slice(0, cap);
const firstNameOf = (full: string) => full.trim().split(/\s+/)[0] || "there";

// Email the client their outstanding intake link(s). Best-effort: dev logs
// instead of sending, and a send failure never blocks the booking.
async function sendIntakeInvite(args: {
  origin: string; to: string; clientName: string; clinicianId: string; clinicianName: string;
  serviceName: string; whenText: string; forms: { form: string; url: string }[];
}): Promise<void> {
  if (args.forms.length === 0) return;
  try {
    await sendBrandedEmail(args.to, "Your intake forms for The Institute for Essential Care", {
      heading: args.forms.length > 1 ? "A couple of quick forms" : "One quick form",
      greetingName: firstNameOf(args.clientName),
      intro: `Thank you for booking your ${args.serviceName} appointment. Before your visit, please complete the following so we're ready for you:`,
      rows: [
        { label: "Service", value: args.serviceName },
        { label: "Clinician", value: args.clinicianName },
        { label: "When", value: args.whenText },
      ],
      buttons: args.forms.map((f) => ({ label: `Complete your ${formShortLabel(f.form as never)}`, url: f.url })),
      note: "Each form takes a few minutes and is kept confidential. If you have any trouble, just reply to this email.",
    });
  } catch { /* never block a booking on email */ }
}

// "You're booked" confirmation, sent to the client on a successful booking.
async function sendBookingConfirmation(args: {
  id: string; startAt: string; endAt: string;
  to: string; clientName: string; serviceName: string; clinicianName: string;
  whenText: string; mode: string; locationOrLink: string; manageUrl: string; intakeForms: string[];
}): Promise<void> {
  const isLink = /^https?:\/\//.test(args.locationOrLink);
  const location = args.mode === "virtual"
    ? (isLink ? "Online (video)" : "Online (your video link will follow by email)")
    : (args.locationOrLink || "The Institute for Essential Care");
  const buttons: { label: string; url: string }[] = [];
  if (args.mode === "virtual" && isLink) buttons.push({ label: "Join the video call", url: args.locationOrLink });
  buttons.push({ label: "Manage or cancel your booking", url: args.manageUrl });
  // A calendar invite so the client can add it to Apple / Google / Outlook.
  const ics = appointmentInvite({
    id: args.id, startAt: args.startAt, endAt: args.endAt, serviceName: args.serviceName,
    clinicianName: args.clinicianName, location: isLink ? args.locationOrLink : location,
    manageUrl: args.manageUrl, clientName: args.clientName, clientEmail: args.to,
    organizerEmail: process.env.SMTP_FROM || process.env.SMTP_USER || undefined, method: "REQUEST",
  });
  try {
    await sendBrandedEmail(args.to, "You're booked with The Institute for Essential Care", {
      heading: "You're booked in! 🎉",
      greetingName: firstNameOf(args.clientName),
      intro: "We can't wait to see you. Here are the details of your appointment:",
      rows: [
        { label: "Service", value: args.serviceName },
        { label: "Clinician", value: args.clinicianName },
        { label: "When", value: args.whenText },
        { label: "Location", value: location },
      ],
      buttons,
      note: args.intakeForms.length ? `We've also emailed your ${args.intakeForms.join(" and ")} to complete before your visit, so we're ready for you.` : undefined,
      outro: "We look forward to seeing you.",
    }, { content: ics, method: "REQUEST", filename: "appointment.ics" });
  } catch { /* never block a booking on email */ }
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
  if (!canBook(clinicianId)) return NextResponse.json({ error: "That clinician is unavailable." }, { status: 404 });

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
  const assessment = await assessClientIntake(name, type.name, email);
  const firstVisit = body.firstVisit === true;
  const missingForms = firstVisit && assessment.requiredForms.length > 0 ? assessment.requiredForms : assessment.missingForms;
  const needsIntake = assessment.requiredForms.length > 0 && missingForms.length > 0;
  const intakeStatus = assessment.requiredForms.length === 0 ? "not_required" : (needsIntake ? "pending" : "received");
  // One couple id, stored on the appointment, so the invite and any later
  // reminder share the same link and both partners' submissions group together.
  const coupleId = missingForms.includes("couples") ? randomBytes(6).toString("hex") : null;

  let appt = await createAppointment({
    kind: "appointment", clientName: name, clientEmail: email, clinicianId, typeId: type.id,
    startAt, endAt, mode, status: "booked", source: "client",
    insurancePath: path, insurerId: path === "insurance" ? clean(body.insurerId, 64) || null : null,
    policyNo: path === "insurance" ? clean(body.policyNo, 60) : "",
    intakeStatus, coupleId,
    answers,
    notes: [phone ? `Phone: ${phone}` : "", clean(body.notes, 500)].filter(Boolean).join(" · "),
  } as never);

  const origin = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const clinicianName = getClinician(clinicianId)?.name || "your clinician";

  // Auto-email the outstanding intake link(s) to a new (or not-yet-completed)
  // client. One couple id ties both partners' couples submissions together.
  if (needsIntake) {
    const forms = missingForms.map((form) => ({ form, url: `${origin}${intakeLinkPath(clinicianId, form, coupleId || undefined)}` }));
    await sendIntakeInvite({ origin, to: email, clientName: name, clinicianId, clinicianName, serviceName: type.name, whenText: caymanWhen(appt.startAt), forms });
  }

  // Auto video link for a virtual booking, on the clinician's own connected
  // account (best-effort; never blocks). Done before the confirmation so the
  // join link can be included in it.
  if (mode === "virtual" && !appt.locationOrLink) {
    const link = await createVideoLink(clinicianId, { topic: `TIFEC session - ${name}`, startAtISO: startAt, durationMin: type.durationMin });
    if (link) appt = (await updateAppointment(appt.id, { locationOrLink: link.url, videoEventId: link.ref || null })) || appt;
  }

  // Mirror the appointment onto the clinician's Google Calendar, if connected —
  // unless a Google Meet booking already created the event (videoEventId set).
  if (!appt.videoEventId && await hasGoogleConnection(clinicianId)) {
    const location = mode === "virtual" ? (appt.locationOrLink || "Online") : (appt.locationOrLink || "The Institute for Essential Care");
    const eventId = await upsertGoogleEvent(clinicianId, {
      summary: `${name} — ${type.name}`,
      description: [phone ? `Phone: ${phone}` : "", email].filter(Boolean).join("\n"),
      location, startAtISO: appt.startAt, endAtISO: appt.endAt,
    });
    if (eventId) appt = (await updateAppointment(appt.id, { videoEventId: eventId })) || appt;
  }

  // "You're booked" confirmation (the piece the done screen has always promised).
  await sendBookingConfirmation({
    id: appt.id, startAt: appt.startAt, endAt: appt.endAt,
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
