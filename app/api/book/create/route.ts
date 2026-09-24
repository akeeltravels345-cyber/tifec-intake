import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { CLINICIANS, getClinician, isBookableClinician } from "@/lib/clinicians";
import { listAppointmentTypes, availableSlots, createAppointment, utcFromCayMinutes, findGroupSession, joinGroupSession, type Appointment, type QuestionAnswer } from "@/lib/scheduling";
import { assessClientIntake, intakeLinkPath, formShortLabel } from "@/lib/intakeRouting";
import { caymanWhen } from "@/lib/caymanTime";
import { attachVideoAndCalendar, sendIntakeInvite, sendBookingConfirmation } from "@/lib/bookingCore";
import { portalToken } from "@/lib/portalAuth";
import { addClients } from "@/lib/clients";

export const dynamic = "force-dynamic";

/** Find-or-create the billing client this booking is for, linked to the
 *  clinician, so a new person who books lands in the client hub (and an existing
 *  one just links). Best-effort — booking must never fail because of this.
 *  Returns the client id, or null if it couldn't be resolved. */
async function ensureBookingClient(clinicianId: string, name: string, email: string, phone: string): Promise<string | null> {
  try {
    const parts = name.trim().replace(/\s+/g, " ").split(" ");
    const first = parts[0] ?? "";
    const last = parts.length > 1 ? parts.slice(1).join(" ") : "";
    if (!first && !last) return null;
    const { ids } = await addClients(clinicianId, [{ first, last, insurerId: null, profile: { email: email || undefined, phone: phone || undefined } }]);
    return ids[0] ?? null;
  } catch (err) {
    console.error("booking -> client sync failed:", err);
    return null;
  }
}

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

  // "Book several this month": a list of chosen open times, each booked only if
  // it's still free. Capped so the public page can't create an unbounded batch.
  const sessions = Array.isArray(body.sessions)
    ? (body.sessions as unknown[])
        .map((x) => ({ date: clean((x as Record<string, unknown>)?.date, 10), minute: Number((x as Record<string, unknown>)?.minute) }))
        .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date) && Number.isFinite(s.minute))
        .slice(0, 8)
    : [];
  const isMonth = sessions.length > 0;

  if (!name) return NextResponse.json({ error: "Please give your name." }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Please give a valid email." }, { status: 400 });
  if (!isMonth && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(minute))) return NextResponse.json({ error: "Pick a time." }, { status: 400 });

  const type = (await listAppointmentTypes()).find((t) => t.id === typeId && t.active);
  if (!type) return NextResponse.json({ error: "That service is unavailable." }, { status: 404 });
  if (!canBook(clinicianId)) return NextResponse.json({ error: "That clinician is unavailable." }, { status: 404 });

  // Group session (e.g. PEERS): the client reserves a SEAT in a staff-scheduled
  // session (single booking only; month bookings are for 1:1 services).
  // session rather than booking the whole slot. They join the roster; a full or
  // vanished session is refused so nobody over-fills it.
  if (!isMonth && (type.capacity || 1) > 1) {
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
    // A group attendee is still a client — give them the hub record too.
    await ensureBookingClient(clinicianId, name, email, phone);
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
      portalUrl: `${origin}/portal/${portalToken(email)}`,
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
  if (!isMonth) {
    const free = await availableSlots(clinicianId, date, type.durationMin, Date.now(), type.bufferBeforeMin, type.bufferAfterMin);
    if (!free.includes(minute)) return NextResponse.json({ error: "Sorry, that time was just taken. Please pick another." }, { status: 409 });
  }

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

  // The times to book: a single slot, or the month's chosen sessions. Each is
  // availability-checked at booking time, so a slot taken since selection is
  // skipped and reported rather than double-booked (never silently dropped).
  const toBook = isMonth ? sessions : [{ date, minute }];
  const isMulti = toBook.length > 1;
  const seriesId = isMulti ? randomBytes(8).toString("hex") : null;

  // The client hub: find-or-create this person's client record and link the
  // appointment(s) to it, so a new booker gets a profile and an existing one links.
  const clientId = await ensureBookingClient(clinicianId, name, email, phone);

  const apptFields = {
    kind: "appointment" as const, clientId, clientName: name, clientEmail: email, clinicianId, typeId: type.id,
    mode, status: "booked" as const, source: "client" as const,
    insurancePath: path, insurerId: path === "insurance" ? clean(body.insurerId, 64) || null : null,
    policyNo: path === "insurance" ? clean(body.policyNo, 60) : "",
    intakeStatus, coupleId, answers,
    notes: [phone ? `Phone: ${phone}` : "", clean(body.notes, 500)].filter(Boolean).join(" · "),
  };

  const vidCtx = { clientName: name, email, phone, serviceName: type.name, durationMin: type.durationMin };
  const booked: Appointment[] = [];
  const skippedWhen: string[] = [];

  // Book earliest-first so the confirmation's "first session" is the soonest.
  for (const s of [...toBook].sort((a, b) => (a.date === b.date ? a.minute - b.minute : a.date.localeCompare(b.date)))) {
    const freeS = await availableSlots(clinicianId, s.date, type.durationMin, Date.now(), type.bufferBeforeMin, type.bufferAfterMin);
    if (!freeS.includes(s.minute)) { skippedWhen.push(caymanWhen(utcFromCayMinutes(s.date, s.minute))); continue; }
    const sAt = utcFromCayMinutes(s.date, s.minute);
    const eAt = utcFromCayMinutes(s.date, s.minute + type.durationMin);
    let a = await createAppointment({ ...apptFields, seriesId, startAt: sAt, endAt: eAt } as never);
    a = await attachVideoAndCalendar(a, vidCtx);
    booked.push(a);
  }

  if (booked.length === 0) return NextResponse.json({ error: "Sorry, those times were just taken. Please pick again." }, { status: 409 });
  const appt = booked[0];
  const origin = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const clinicianName = getClinician(clinicianId)?.name || "your clinician";

  // Auto-email the outstanding intake link(s) once (per client, not per session).
  if (needsIntake) {
    const forms = missingForms.map((form) => ({ form, url: `${origin}${intakeLinkPath(clinicianId, form, coupleId || undefined)}` }));
    await sendIntakeInvite({ to: email, clientName: name, clinicianName, serviceName: type.name, whenText: caymanWhen(appt.startAt), forms });
  }

  // One "you're booked" confirmation. For a month booking it lists every booked
  // session, notes any that couldn't be reserved, and the .ics carries them all.
  await sendBookingConfirmation({
    id: appt.id, startAt: appt.startAt, endAt: appt.endAt,
    to: email, clientName: name, serviceName: type.name, clinicianName,
    whenText: caymanWhen(appt.startAt), mode, locationOrLink: appt.locationOrLink,
    manageUrl: `${origin}/book/manage?preview=${PREVIEW}&id=${appt.id}`,
    portalUrl: `${origin}/portal/${portalToken(email)}`,
    intakeForms: needsIntake ? missingForms.map((f) => formShortLabel(f)) : [],
    seriesDates: isMulti ? booked.map((b) => caymanWhen(b.startAt)) : undefined,
    skippedDates: skippedWhen.length ? skippedWhen : undefined,
    events: isMulti ? booked.map((b) => ({ id: b.id, startAt: b.startAt, endAt: b.endAt })) : undefined,
  });

  return NextResponse.json({
    ok: true,
    appointment: { id: appt.id, startAt: appt.startAt, endAt: appt.endAt },
    intakeSent: needsIntake ? missingForms.map((f) => formShortLabel(f)) : [],
    series: isMulti ? { booked: booked.length, skipped: skippedWhen.length } : undefined,
  });
}
