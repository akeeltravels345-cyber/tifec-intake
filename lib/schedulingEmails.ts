// Shared client notices for a moved appointment, so the client Manage page and
// a staff drag-reschedule send exactly the same branded email + calendar update.
import { sendBrandedEmail } from "./email";
import { appointmentInvite } from "./ical";
import { caymanWhen } from "./caymanTime";

const firstNameOf = (full: string) => full.trim().split(/\s+/)[0] || undefined;
const organizerEmail = () => process.env.SMTP_FROM || process.env.SMTP_USER || undefined;

export interface RescheduleNotice {
  to: string; clientName: string; serviceName: string; clinicianName: string;
  id: string; startAt: string; endAt: string; location?: string;
}

/** Email the client that their appointment moved, with an updated calendar
 *  invite. Best-effort; never throws. */
export async function notifyClientReschedule(a: RescheduleNotice): Promise<void> {
  if (!a.to) return;
  const ics = appointmentInvite({
    id: a.id, startAt: a.startAt, endAt: a.endAt, serviceName: a.serviceName, clinicianName: a.clinicianName,
    location: a.location, clientName: a.clientName, clientEmail: a.to, organizerEmail: organizerEmail(), method: "REQUEST",
  });
  try {
    await sendBrandedEmail(a.to, "Your appointment has been rescheduled", {
      heading: "Your appointment has moved",
      greetingName: firstNameOf(a.clientName),
      intro: "Here are the new details:",
      rows: [
        { label: "Service", value: a.serviceName },
        { label: "Clinician", value: a.clinicianName },
        { label: "New time", value: caymanWhen(a.startAt) },
      ],
      outro: "Need to change it again? Manage your booking from the link in your original confirmation, or reply to this email. We look forward to seeing you.",
    }, { content: ics, method: "REQUEST", filename: "appointment.ics" });
  } catch { /* never block the change on email */ }
}
