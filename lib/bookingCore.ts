// =============================================================================
// Shared booking side-effects, reused by the public booking route, the
// client-facing recurring series, and the waitlist auto-fill claim.
//   - attachVideoAndCalendar: give a virtual booking a video link and mirror the
//     appointment onto the clinician's Google Calendar (best-effort).
//   - sendIntakeInvite / sendBookingConfirmation: the branded client emails.
// Everything here is best-effort: a failure never blocks the booking itself.
// =============================================================================

import { type Appointment, updateAppointment } from "@/lib/scheduling";
import { createVideoLink, hasGoogleConnection, upsertGoogleEvent } from "@/lib/videoConnections";
import { formShortLabel } from "@/lib/intakeRouting";
import { sendBrandedEmail } from "@/lib/email";
import { appointmentInvite, buildIcs } from "@/lib/ical";

const firstNameOf = (full: string) => full.trim().split(/\s+/)[0] || "there";
const organizerEmail = () => process.env.SMTP_FROM || process.env.SMTP_USER || undefined;

/** Give a just-created appointment its video link (virtual, if none set yet)
 *  and push it to the clinician's Google Calendar. Returns the updated row. */
export async function attachVideoAndCalendar(appt: Appointment, ctx: {
  clientName: string; email: string; phone?: string; serviceName: string; durationMin: number;
}): Promise<Appointment> {
  let a = appt;
  if (a.mode === "virtual" && !a.locationOrLink) {
    const link = await createVideoLink(a.clinicianId, { topic: `TIFEC session - ${ctx.clientName}`, startAtISO: a.startAt, durationMin: ctx.durationMin });
    if (link) a = (await updateAppointment(a.id, { locationOrLink: link.url, videoEventId: link.ref || null })) || a;
  }
  if (!a.videoEventId && await hasGoogleConnection(a.clinicianId)) {
    const location = a.mode === "virtual" ? (a.locationOrLink || "Online") : (a.locationOrLink || "The Institute for Essential Care");
    const eventId = await upsertGoogleEvent(a.clinicianId, {
      summary: `${ctx.clientName} — ${ctx.serviceName}`,
      description: [ctx.phone ? `Phone: ${ctx.phone}` : "", ctx.email].filter(Boolean).join("\n"),
      location, startAtISO: a.startAt, endAtISO: a.endAt,
    });
    if (eventId) a = (await updateAppointment(a.id, { videoEventId: eventId })) || a;
  }
  return a;
}

// Email the client their outstanding intake link(s). Best-effort.
export async function sendIntakeInvite(args: {
  to: string; clientName: string; clinicianName: string; serviceName: string; whenText: string;
  forms: { form: string; url: string }[];
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

// "You're booked" confirmation. For a standing series, `seriesDates` lists every
// booked date and the .ics carries the recurrence so the whole run lands in the
// client's calendar in one go.
export async function sendBookingConfirmation(args: {
  id: string; startAt: string; endAt: string;
  to: string; clientName: string; serviceName: string; clinicianName: string;
  whenText: string; mode: string; locationOrLink: string; manageUrl: string; intakeForms: string[];
  seriesDates?: string[];   // pretty "when" strings for each booked occurrence (>1 = a series)
  skippedDates?: string[];  // pretty strings for weeks that couldn't be booked
  recurrence?: { everyDays: number; count: number };
  events?: { id: string; startAt: string; endAt: string }[]; // month booking: one .ics event per session
  extraNotes?: string[];    // any extra sentences to add to the note block
  portalUrl?: string;       // one-tap link to the client's self-service portal
}): Promise<void> {
  const isLink = /^https?:\/\//.test(args.locationOrLink);
  const location = args.mode === "virtual"
    ? (isLink ? "Online (video)" : "Online (your video link will follow by email)")
    : (args.locationOrLink || "The Institute for Essential Care");
  const isSeries = !!args.seriesDates && args.seriesDates.length > 1;
  const buttons: { label: string; url: string }[] = [];
  if (args.mode === "virtual" && isLink) buttons.push({ label: "Join the video call", url: args.locationOrLink });
  if (args.manageUrl) buttons.push({ label: "Manage or cancel your booking", url: args.manageUrl });
  if (args.portalUrl) buttons.push({ label: "See all your appointments", url: args.portalUrl });

  const rows = isSeries
    ? [
        { label: "Service", value: args.serviceName },
        { label: "Clinician", value: args.clinicianName },
        { label: "First session", value: args.whenText },
        { label: "Sessions", value: `${args.seriesDates!.length} booked` },
        { label: "Location", value: location },
      ]
    : [
        { label: "Service", value: args.serviceName },
        { label: "Clinician", value: args.clinicianName },
        { label: "When", value: args.whenText },
        { label: "Location", value: location },
      ];

  const notes: string[] = [];
  if (isSeries) notes.push(`Your sessions this month: ${args.seriesDates!.join("; ")}.`);
  if (args.skippedDates && args.skippedDates.length) notes.push(`We couldn't reserve ${args.skippedDates.join("; ")} (just taken), so please rebook those or reply and we'll help.`);
  if (args.intakeForms.length) notes.push(`We've also emailed your ${args.intakeForms.join(" and ")} to complete before your visit, so we're ready for you.`);
  if (args.extraNotes) for (const n of args.extraNotes) if (n) notes.push(n);

  // A month booking attaches one calendar event per session; a single booking
  // attaches the usual one-event invite (with recurrence when a cadence applies).
  const ics = (args.events && args.events.length > 1)
    ? buildIcs(args.events.map((e) => ({
        uid: `${e.id}@caymanessentialcare.com`, start: e.startAt, end: e.endAt,
        summary: `${args.serviceName} with The Institute for Essential Care`,
        location: isLink ? args.locationOrLink : location,
        organizerName: "The Institute for Essential Care", organizerEmail: organizerEmail(),
        attendeeName: args.clientName, attendeeEmail: args.to,
        status: "CONFIRMED" as const, sequence: Math.floor(Date.now() / 1000),
      })), { method: "REQUEST" })
    : appointmentInvite({
        id: args.id, startAt: args.startAt, endAt: args.endAt, serviceName: args.serviceName,
        clinicianName: args.clinicianName, location: isLink ? args.locationOrLink : location,
        manageUrl: args.manageUrl, clientName: args.clientName, clientEmail: args.to,
        organizerEmail: organizerEmail(), method: "REQUEST",
        recurrence: isSeries ? args.recurrence : undefined,
      });
  try {
    await sendBrandedEmail(args.to, "You're booked with The Institute for Essential Care", {
      heading: "You're booked in! 🎉",
      greetingName: firstNameOf(args.clientName),
      intro: isSeries ? "We can't wait to see you. Here are the details of your sessions this month:" : "We can't wait to see you. Here are the details of your appointment:",
      rows,
      buttons,
      note: notes.length ? notes.join(" ") : undefined,
      outro: "We look forward to seeing you.",
    }, { content: ics, method: "REQUEST", filename: "appointment.ics" });
  } catch { /* never block a booking on email */ }
}
