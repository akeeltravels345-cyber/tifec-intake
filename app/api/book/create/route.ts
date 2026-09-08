import { NextResponse } from "next/server";
import { CLINICIANS } from "@/lib/clinicians";
import { listAppointmentTypes, availableSlots, createAppointment, updateAppointment, utcFromCayMinutes, getSchedulingSettings, type QuestionAnswer } from "@/lib/scheduling";
import { createVideoLink } from "@/lib/videoLinks";

export const dynamic = "force-dynamic";

const PREVIEW = "peek";
const bookable = () => CLINICIANS.filter((c) => !c.intakeHidden && c.contact !== "biller");
const clean = (v: unknown, cap = 200) => String(v ?? "").trim().slice(0, cap);

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

  let appt = await createAppointment({
    kind: "appointment", clientName: name, clientEmail: email, clinicianId, typeId: type.id,
    startAt, endAt, mode, status: "booked", source: "client",
    insurancePath: path, insurerId: path === "insurance" ? clean(body.insurerId, 64) || null : null,
    policyNo: path === "insurance" ? clean(body.policyNo, 60) : "",
    intakeStatus: type.intakeFormKey ? "pending" : "not_required",
    answers,
    notes: [phone ? `Phone: ${phone}` : "", clean(body.notes, 500)].filter(Boolean).join(" · "),
  } as never);

  // Auto video link for a virtual booking (best-effort; never blocks).
  if (mode === "virtual" && !appt.locationOrLink) {
    const { video } = await getSchedulingSettings();
    const link = await createVideoLink(video, { clinicianId, topic: `TIFEC session - ${name}`, startAtISO: startAt, durationMin: type.durationMin });
    if (link) appt = (await updateAppointment(appt.id, { locationOrLink: link.url })) || appt;
  }

  return NextResponse.json({ ok: true, appointment: { id: appt.id, startAt: appt.startAt, endAt: appt.endAt } });
}
