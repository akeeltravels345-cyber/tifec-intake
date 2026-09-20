// =============================================================================
// iCalendar (RFC 5545) generation for TIFEC appointments.
//   - A single-event invite (.ics) attached to booking emails, so a client can
//     add / update / cancel the appointment in Apple Calendar, Google or Outlook.
//   - A multi-event VCALENDAR feed for a clinician's subscribe URL.
// Times are emitted as UTC (the "Z" form), which every calendar renders in the
// viewer's own timezone, so no VTIMEZONE block is needed.
// =============================================================================

export type IcsMethod = "REQUEST" | "CANCEL" | "PUBLISH";

export interface IcsEvent {
  uid: string;                 // stable per appointment, so updates/cancels match
  start: string;               // ISO UTC
  end: string;                 // ISO UTC
  summary: string;
  description?: string;
  location?: string;           // room name or a video URL
  url?: string;
  organizerName?: string;
  organizerEmail?: string;
  attendeeName?: string;
  attendeeEmail?: string;
  status?: "CONFIRMED" | "CANCELLED";
  sequence?: number;           // bump on each change so clients accept the update
}

const PRODID = "-//The Institute for Essential Care//Scheduling//EN";

// 2026-09-24T14:30:00.000Z -> 20260924T143000Z
function fmtUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// RFC 5545 text escaping for property values.
function esc(v: string): string {
  return String(v).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Fold a content line to <=75 octets, continuation lines start with a space.
function fold(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length) { out.push(" " + rest.slice(0, 74)); rest = rest.slice(74); }
  return out.join("\r\n");
}

function veventLines(e: IcsEvent): string[] {
  const now = fmtUtc(new Date().toISOString());
  const lines = [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${fmtUtc(e.start)}`,
    `DTEND:${fmtUtc(e.end)}`,
    `SEQUENCE:${e.sequence ?? 0}`,
    `STATUS:${e.status ?? "CONFIRMED"}`,
    `SUMMARY:${esc(e.summary)}`,
  ];
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  if (e.url) lines.push(`URL:${esc(e.url)}`);
  if (e.organizerEmail) lines.push(`ORGANIZER;CN=${esc(e.organizerName || e.organizerEmail)}:mailto:${e.organizerEmail}`);
  if (e.attendeeEmail) lines.push(`ATTENDEE;CN=${esc(e.attendeeName || e.attendeeEmail)};RSVP=FALSE:mailto:${e.attendeeEmail}`);
  lines.push("END:VEVENT");
  return lines;
}

/** A full VCALENDAR string for one or more events. */
export function buildIcs(events: IcsEvent[], opts: { method?: IcsMethod; calName?: string } = {}): string {
  const head = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
  ];
  if (opts.method) head.push(`METHOD:${opts.method}`);
  if (opts.calName) { head.push(`X-WR-CALNAME:${esc(opts.calName)}`, `NAME:${esc(opts.calName)}`); }
  const lines = [...head, ...events.flatMap(veventLines), "END:VCALENDAR"];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** A single-appointment invite (.ics) for a booking email. REQUEST adds/updates
 *  it in the client's calendar; CANCEL (cancelled=true) removes it. The uid is
 *  stable per appointment so a later reschedule/cancel matches the same event. */
export function appointmentInvite(a: {
  id: string; startAt: string; endAt: string; serviceName: string; clinicianName: string;
  location?: string; manageUrl?: string; clientName?: string; clientEmail?: string;
  organizerEmail?: string; method: IcsMethod; cancelled?: boolean;
}): string {
  const description = [`${a.serviceName} with ${a.clinicianName}.`, a.manageUrl ? `Manage your booking: ${a.manageUrl}` : ""].filter(Boolean).join("\n");
  return buildIcs([{
    uid: `${a.id}@caymanessentialcare.com`,
    start: a.startAt, end: a.endAt,
    summary: `${a.serviceName} — The Institute for Essential Care`,
    description, location: a.location,
    organizerName: "The Institute for Essential Care", organizerEmail: a.organizerEmail,
    attendeeName: a.clientName, attendeeEmail: a.clientEmail,
    status: a.cancelled ? "CANCELLED" : "CONFIRMED",
    sequence: Math.floor(Date.now() / 1000), // monotonic, so each change supersedes
  }], { method: a.method });
}
