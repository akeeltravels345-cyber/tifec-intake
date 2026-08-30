import { NextResponse } from "next/server";
import { getClinician } from "@/lib/clinicians";
import { getAppointment, updateAppointment, availableSlots, listAppointmentTypes, utcFromCayMinutes } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

const PREVIEW = "peek";

async function summarize(id: string) {
  const a = await getAppointment(id);
  if (!a || a.kind !== "appointment") return null;
  const type = (await listAppointmentTypes()).find((t) => t.id === a.typeId);
  return {
    id: a.id, service: type?.name || "Appointment", typeId: a.typeId, durationMin: type?.durationMin || Math.round((Date.parse(a.endAt) - Date.parse(a.startAt)) / 60000),
    clinicianId: a.clinicianId, clinicianName: getClinician(a.clinicianId)?.name || "", clientName: a.clientName,
    startAt: a.startAt, endAt: a.endAt, mode: a.mode, status: a.status,
  };
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  if (p.get("preview") !== PREVIEW) return NextResponse.json({ error: "Not available." }, { status: 403 });
  const s = await summarize(p.get("id") || "");
  if (!s) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  return NextResponse.json({ appointment: s });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  if (body.preview !== PREVIEW) return NextResponse.json({ error: "Not available." }, { status: 403 });

  const id = String(body.id || "");
  const a = await getAppointment(id);
  if (!a || a.kind !== "appointment") return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (a.status === "cancelled") return NextResponse.json({ error: "This booking is already cancelled." }, { status: 409 });

  const action = String(body.action || "");

  if (action === "cancel") {
    await updateAppointment(id, { status: "cancelled" } as never);
    return NextResponse.json({ ok: true, cancelled: true });
  }

  if (action === "reschedule") {
    const date = String(body.date || "");
    const minute = Number(body.minute);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(minute)) return NextResponse.json({ error: "Pick a time." }, { status: 400 });
    const type = (await listAppointmentTypes()).find((t) => t.id === a.typeId);
    const dur = type?.durationMin || Math.round((Date.parse(a.endAt) - Date.parse(a.startAt)) / 60000);
    const startAt = utcFromCayMinutes(date, minute);
    if (startAt !== a.startAt) {
      // Any different time must be genuinely open for this clinician.
      const free = await availableSlots(a.clinicianId, date, dur);
      if (!free.includes(minute)) return NextResponse.json({ error: "Sorry, that time isn't open. Please pick another." }, { status: 409 });
    }
    const endAt = utcFromCayMinutes(date, minute + dur);
    await updateAppointment(id, { startAt, endAt } as never);
    return NextResponse.json({ ok: true, appointment: await summarize(id) });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
