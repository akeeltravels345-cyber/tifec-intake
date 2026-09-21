import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { CLINICIANS, getClinician, isBookableClinician } from "@/lib/clinicians";
import { listAppointmentTypes, availableSlots, createAppointment, utcFromCayMinutes, findGroupSession, joinGroupSession, type Appointment, type QuestionAnswer } from "@/lib/scheduling";
import { assessClientIntake, intakeLinkPath, formShortLabel } from "@/lib/intakeRouting";
import { caymanWhen } from "@/lib/caymanTime";
import { attachVideoAndCalendar, sendIntakeInvite, sendBookingConfirmation } from "@/lib/bookingCore";

export const dynamic = "force-dynamic";

const PREVIEW = "peek";
const canBook = (id: string) => { const c = CLINICIANS.find((x) => x.id === id); return !!c && isBookableClinician(c); };
const clean = (v: unknown, cap = 200) => String(v ?? "").trim().slice(0, cap);
const addDaysStr = (dateStr: string, n: number) => { const [y, m, d] = dateStr.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

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

  // Group session (e.g. PEERS): the client reserves a SEAT in a staff-scheduled
  // session rather than booking the whole slot. They join the roster; a full or
  // vanished session is refused so nobody over-fills it.
  if ((type.capacity || 1) > 1) {
    const startAt = utcFromCayMinutes(date, minute);
    const session = await findGroupSession(clinicianId, type.id, startAt);
    if (!session || session.attendees.length >= session.capacity) {
      return NextResponse.json({ error: "Sorry, that session is full or no longer available. Please pick another." }, { status: 409 });
    }
    const joined = await joinGroupSession(session.id, { name, email, phone });
    if (!joined.ok) {
      if (joined.reason === "duplicate") return NextResponse.json({ error: "You're already booked into this session." }, { status: 409 });
      return NextResponse.json({ error: "Sorry, that session just filled. Please pick another." }, { status: 409 });
    }
    const origin = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
    const clinicianName = getClinician(clinicianId)?.name || "your clinician";

    const assessment = await assessClientIntake(name, type.name, email);
    const firstVisit = body.firstVisit === true;
    const missingForms = firstVisit && assessment.requiredForms.length > 0 ? assessment.requiredForms : assessment.missingForms;
    const needsIntake = assessment.requiredForms.length > 0 && missingForms.length > 0;
    const coupleId = missingForms.includes("couples") ? randomBytes(6).toString("hex") : null;
    if (needsIntake) {
      const forms = missingForms.map((form) => ({ form, url: `${origin}${intakeLinkPath(clinicianId, form, coupleId || undefined)}` }));
      await sendIntakeInvite({ to: email, clientName: name, clinicianName, serviceName: type.name, whenText: caymanWhen(session.startAt), forms });
    }
    await sendBookingConfirmation({
      id: session.id, startAt: session.startAt, endAt: session.endAt,
      to: email, clientName: name, serviceName: type.name, clinicianName,
      whenText: caymanWhen(session.startAt), mode: session.mode, locationOrLink: session.locationOrLink,
      manageUrl: "", // a group attendee must not get the session's cancel link
      intakeForms: needsIntake ? missingForms.map((f) => formShortLabel(f)) : [],
      extraNotes: ["To change or cancel your seat, just reply to this email and we'll help."],
    });
    return NextResponse.json({
      ok: true,
      appointment: { id: session.id, startAt: session.startAt, endAt: session.endAt },
      intakeSent: needsIntake ? missingForms.map((f) => formShortLabel(f)) : [],
    });
  }

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

  // Standing series: a client can book this as a weekly (7) or biweekly (14)
  // appointment for a handful of sessions. Only whole-week cadences and up to 12
  // sessions are accepted from the public page. The first slot is already known
  // to be free; later weeks are availability-checked and any taken week is
  // skipped and reported rather than double-booked.
  const everyDays = [7, 14].includes(Number(body.repeatEveryDays)) ? Number(body.repeatEveryDays) : 0;
  const wanted = everyDays ? Math.max(2, Math.min(12, Math.floor(Number(body.repeatCount) || 0))) : 1;
  const isSeries = everyDays > 0 && wanted > 1;
  const seriesId = isSeries ? randomBytes(8).toString("hex") : null;

  const apptFields = {
    kind: "appointment" as const, clientName: name, clientEmail: email, clinicianId, typeId: type.id,
    mode, status: "booked" as const, source: "client" as const,
    insurancePath: path, insurerId: path === "insurance" ? clean(body.insurerId, 64) || null : null,
    policyNo: path === "insurance" ? clean(body.policyNo, 60) : "",
    intakeStatus, coupleId, answers,
    notes: [phone ? `Phone: ${phone}` : "", clean(body.notes, 500)].filter(Boolean).join(" · "),
  };

  const vidCtx = { clientName: name, email, phone, serviceName: type.name, durationMin: type.durationMin };
  const booked: Appointment[] = [];
  const skippedWhen: string[] = [];

  for (let i = 0; i < wanted; i++) {
    const dateI = i === 0 ? date : addDaysStr(date, i * everyDays);
    if (i > 0) {
      const freeI = await availableSlots(clinicianId, dateI, type.durationMin, Date.now(), type.bufferBeforeMin, type.bufferAfterMin);
      if (!freeI.includes(minute)) { skippedWhen.push(caymanWhen(utcFromCayMinutes(dateI, minute))); continue; }
    }
    const sAt = utcFromCayMinutes(dateI, minute);
    const eAt = utcFromCayMinutes(dateI, minute + type.durationMin);
    let a = await createAppointment({ ...apptFields, seriesId, startAt: sAt, endAt: eAt } as never);
    a = await attachVideoAndCalendar(a, vidCtx);
    booked.push(a);
  }

  const appt = booked[0];
  const origin = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const clinicianName = getClinician(clinicianId)?.name || "your clinician";

  // Auto-email the outstanding intake link(s) once (per client, not per session).
  if (needsIntake) {
    const forms = missingForms.map((form) => ({ form, url: `${origin}${intakeLinkPath(clinicianId, form, coupleId || undefined)}` }));
    await sendIntakeInvite({ to: email, clientName: name, clinicianName, serviceName: type.name, whenText: caymanWhen(appt.startAt), forms });
  }

  // One "you're booked" confirmation. For a series it lists every booked date,
  // notes any weeks that couldn't be reserved, and the .ics carries the recurrence.
  await sendBookingConfirmation({
    id: appt.id, startAt: appt.startAt, endAt: appt.endAt,
    to: email, clientName: name, serviceName: type.name, clinicianName,
    whenText: caymanWhen(appt.startAt), mode, locationOrLink: appt.locationOrLink,
    manageUrl: `${origin}/book/manage?preview=${PREVIEW}&id=${appt.id}`,
    intakeForms: needsIntake ? missingForms.map((f) => formShortLabel(f)) : [],
    seriesDates: isSeries ? booked.map((b) => caymanWhen(b.startAt)) : undefined,
    skippedDates: skippedWhen.length ? skippedWhen : undefined,
    recurrence: isSeries ? { everyDays, count: booked.length } : undefined,
  });

  return NextResponse.json({
    ok: true,
    appointment: { id: appt.id, startAt: appt.startAt, endAt: appt.endAt },
    intakeSent: needsIntake ? missingForms.map((f) => formShortLabel(f)) : [],
    series: isSeries ? { booked: booked.length, skipped: skippedWhen.length } : undefined,
  });
}
