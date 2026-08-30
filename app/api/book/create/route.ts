import { NextResponse } from "next/server";
import { CLINICIANS } from "@/lib/clinicians";
import { listAppointmentTypes, availableSlots, createAppointment, utcFromCayMinutes } from "@/lib/scheduling";

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
  const free = await availableSlots(clinicianId, date, type.durationMin);
  if (!free.includes(minute)) return NextResponse.json({ error: "Sorry, that time was just taken. Please pick another." }, { status: 409 });

  const startAt = utcFromCayMinutes(date, minute);
  const endAt = utcFromCayMinutes(date, minute + type.durationMin);
  const path = body.insurancePath === "insurance" ? "insurance" : "self_pay";

  const appt = await createAppointment({
    kind: "appointment", clientName: name, clientEmail: email, clinicianId, typeId: type.id,
    startAt, endAt, mode: type.mode, status: "booked", source: "client",
    insurancePath: path, insurerId: path === "insurance" ? clean(body.insurerId, 64) || null : null,
    policyNo: path === "insurance" ? clean(body.policyNo, 60) : "",
    intakeStatus: type.intakeFormKey ? "pending" : "not_required",
    notes: [phone ? `Phone: ${phone}` : "", clean(body.notes, 500)].filter(Boolean).join(" · "),
  } as never);

  return NextResponse.json({ ok: true, appointment: { id: appt.id, startAt: appt.startAt, endAt: appt.endAt } });
}
