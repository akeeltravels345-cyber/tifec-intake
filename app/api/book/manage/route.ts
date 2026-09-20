import { NextResponse } from "next/server";
import { getClinician } from "@/lib/clinicians";
import { getAppointment, updateAppointment, availableSlots, listAppointmentTypes, utcFromCayMinutes, getSchedulingSettings } from "@/lib/scheduling";
import { cancelVideoLink } from "@/lib/videoConnections";
import { sendClientEmail } from "@/lib/email";
import { caymanWhen } from "@/lib/caymanTime";

export const dynamic = "force-dynamic";

const PREVIEW = "peek";
const firstNameOf = (full: string) => full.trim().split(/\s+/)[0] || "there";

// Confirm a cancellation to the client. Best-effort; never blocks the change.
async function sendCancelEmail(to: string, clientName: string, serviceName: string, whenText: string): Promise<void> {
  if (!to) return;
  const text =
    `Hi ${firstNameOf(clientName)},\n\n` +
    `Your appointment has been cancelled:\n\n` +
    `Service:  ${serviceName}\n` +
    `Was:      ${whenText}\n\n` +
    `If this was a mistake, or you'd like to rebook, just visit our booking page or reply to this email and we'll be glad to help.\n\n` +
    `Warmly,\nThe Institute for Essential Care`;
  try { await sendClientEmail(to, "Your appointment has been cancelled", text); }
  catch { /* never block the change on email */ }
}

// Confirm a reschedule to the client. Best-effort; never blocks the change.
async function sendRescheduleEmail(to: string, clientName: string, serviceName: string, clinicianName: string, whenText: string): Promise<void> {
  if (!to) return;
  const text =
    `Hi ${firstNameOf(clientName)},\n\n` +
    `Your appointment has been moved. Here are the new details:\n\n` +
    `Service:     ${serviceName}\n` +
    `Clinician:   ${clinicianName}\n` +
    `New time:    ${whenText}\n\n` +
    `Need to change it again? Manage your booking from the link in your original confirmation, or reply to this email.\n\n` +
    `We look forward to seeing you.\n\n` +
    `Warmly,\nThe Institute for Essential Care`;
  try { await sendClientEmail(to, "Your appointment has been rescheduled", text); }
  catch { /* never block the change on email */ }
}

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

  // Cancellation window: clients can't self-reschedule or cancel too close to the
  // appointment (they must call). Enforced server-side so it can't be bypassed.
  if (action === "cancel" || action === "reschedule") {
    const win = (await getSchedulingSettings()).booking.cancelWindowHours || 0;
    if (win > 0 && Date.parse(a.startAt) - Date.now() < win * 3600e3) {
      return NextResponse.json({ error: `Changes must be made at least ${win} hours before the appointment. Please call us to make a change.` }, { status: 409 });
    }
  }

  if (action === "cancel") {
    await updateAppointment(id, { status: "cancelled" } as never);
    // Free the Zoom meeting from the clinician's account too.
    if (a.mode === "virtual" && a.locationOrLink) await cancelVideoLink(a.clinicianId, a.locationOrLink, a.videoEventId || undefined);
    const type = (await listAppointmentTypes()).find((t) => t.id === a.typeId);
    await sendCancelEmail(a.clientEmail, a.clientName, type?.name || "Appointment", caymanWhen(a.startAt));
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
      const free = await availableSlots(a.clinicianId, date, dur, Date.now(), type?.bufferBeforeMin || 0, type?.bufferAfterMin || 0);
      if (!free.includes(minute)) return NextResponse.json({ error: "Sorry, that time isn't open. Please pick another." }, { status: 409 });
    }
    const endAt = utcFromCayMinutes(date, minute + dur);
    await updateAppointment(id, { startAt, endAt } as never);
    if (startAt !== a.startAt) {
      await sendRescheduleEmail(a.clientEmail, a.clientName, type?.name || "Appointment", getClinician(a.clinicianId)?.name || "your clinician", caymanWhen(startAt));
    }
    return NextResponse.json({ ok: true, appointment: await summarize(id) });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
