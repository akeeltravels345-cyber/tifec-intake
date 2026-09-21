import { NextResponse } from "next/server";
import { getClinician } from "@/lib/clinicians";
import { getAppointment, updateAppointment, availableSlots, listAppointmentTypes, utcFromCayMinutes, getSchedulingSettings } from "@/lib/scheduling";
import { cancelVideoLink, upsertGoogleEvent, deleteGoogleEvent } from "@/lib/videoConnections";
import { sendBrandedEmail } from "@/lib/email";
import { caymanWhen } from "@/lib/caymanTime";
import { appointmentInvite } from "@/lib/ical";
import { notifyClientReschedule } from "@/lib/schedulingEmails";

export const dynamic = "force-dynamic";

const PREVIEW = "peek";
const firstNameOf = (full: string) => full.trim().split(/\s+/)[0] || undefined;
const organizerEmail = () => process.env.SMTP_FROM || process.env.SMTP_USER || undefined;

// Confirm a cancellation to the client + remove it from their calendar.
async function sendCancelEmail(a: { to: string; clientName: string; serviceName: string; clinicianName: string; whenText: string; id: string; startAt: string; endAt: string }): Promise<void> {
  if (!a.to) return;
  const ics = appointmentInvite({
    id: a.id, startAt: a.startAt, endAt: a.endAt, serviceName: a.serviceName, clinicianName: a.clinicianName,
    clientName: a.clientName, clientEmail: a.to, organizerEmail: organizerEmail(), method: "CANCEL", cancelled: true,
  });
  try {
    await sendBrandedEmail(a.to, "Your appointment has been cancelled", {
      heading: "Appointment cancelled",
      greetingName: firstNameOf(a.clientName),
      intro: "This appointment has been cancelled:",
      rows: [
        { label: "Service", value: a.serviceName },
        { label: "Was", value: a.whenText },
      ],
      outro: "If this was a mistake, or you'd like to rebook, just visit our booking page or reply to this email and we'll be glad to help.",
    }, { content: ics, method: "CANCEL", filename: "appointment.ics" });
  } catch { /* never block the change on email */ }
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
    // Free the Zoom / Meet meeting from the clinician's account too.
    if (a.mode === "virtual" && a.locationOrLink) await cancelVideoLink(a.clinicianId, a.locationOrLink, a.videoEventId || undefined);
    // Remove the plain Google Calendar event (Meet events are handled above).
    if (a.videoEventId && !/meet\.google\.com/i.test(a.locationOrLink || "")) await deleteGoogleEvent(a.clinicianId, a.videoEventId);
    const type = (await listAppointmentTypes()).find((t) => t.id === a.typeId);
    await sendCancelEmail({
      to: a.clientEmail, clientName: a.clientName, serviceName: type?.name || "Appointment",
      clinicianName: getClinician(a.clinicianId)?.name || "your clinician", whenText: caymanWhen(a.startAt),
      id: a.id, startAt: a.startAt, endAt: a.endAt,
    });
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
      const loc = a.mode === "virtual" ? a.locationOrLink : (a.locationOrLink || "The Institute for Essential Care");
      // Move the event on the clinician's Google Calendar to the new time.
      if (a.videoEventId) await upsertGoogleEvent(a.clinicianId, {
        eventId: a.videoEventId, summary: `${a.clientName} — ${type?.name || "Appointment"}`, location: loc, startAtISO: startAt, endAtISO: endAt,
      });
      await notifyClientReschedule({
        to: a.clientEmail, clientName: a.clientName, serviceName: type?.name || "Appointment",
        clinicianName: getClinician(a.clinicianId)?.name || "your clinician",
        id: a.id, startAt, endAt, location: loc,
      });
    }
    return NextResponse.json({ ok: true, appointment: await summarize(id) });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
