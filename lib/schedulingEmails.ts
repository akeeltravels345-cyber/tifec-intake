// Shared client notices for a moved appointment, so the client Manage page and
// a staff drag-reschedule send exactly the same branded email + calendar update.
import { sendBrandedEmail } from "./email";
import { appointmentInvite } from "./ical";
import { caymanWhen } from "./caymanTime";
import { type Appointment, listAppointmentTypes, setWaitlistStatus } from "./scheduling";
import { getClinician } from "./clinicians";
import { matchingWaiters, createOfferForSlot } from "./waitlistOffers";

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

/** A cancellation just freed this slot. Offer it to every matching waitlisted
 *  client at once, each with a personal one-tap claim link (first to confirm
 *  wins). Best-effort: never throws, and does nothing if nobody's waiting or the
 *  offers table isn't migrated yet. Returns how many clients were notified. */
export async function offerFreedSlotToWaitlist(a: Appointment, origin: string): Promise<number> {
  try {
    // Only future, real appointments are worth re-offering.
    if (a.kind !== "appointment" || Date.parse(a.startAt) <= Date.now()) return 0;
    const matched = await matchingWaiters(a.clinicianId, a.typeId);
    if (!matched.length) return 0;
    const made = await createOfferForSlot(a, matched);
    if (!made) return 0;

    const type = a.typeId ? (await listAppointmentTypes()).find((t) => t.id === a.typeId) : null;
    const serviceName = type?.name || "an appointment";
    const clinicianName = getClinician(a.clinicianId)?.name || "your clinician";
    const whenText = caymanWhen(a.startAt);
    const base = origin.replace(/\/$/, "");

    let sent = 0;
    for (const { entryId, token } of made.tokens) {
      const entry = matched.find((m) => m.id === entryId);
      if (!entry) continue;
      const claimUrl = `${base}/waitlist/claim/${token}`;
      try {
        await sendBrandedEmail(entry.email, "A spot just opened up", {
          heading: "A spot just opened 🎉",
          greetingName: firstNameOf(entry.name),
          intro: `Good news, a time for ${serviceName} with ${clinicianName} just became available. You're on our waitlist, so we wanted to offer it to you first:`,
          rows: [
            { label: "Service", value: serviceName },
            { label: "Clinician", value: clinicianName },
            { label: "When", value: whenText },
          ],
          buttons: [{ label: "Claim this time", url: claimUrl }],
          note: "This time is open to everyone on the waitlist, so it goes to whoever claims it first. If it's already taken when you tap through, you'll stay on the list for the next opening.",
          outro: "If this time doesn't suit you, no action is needed and you'll keep your place on the waitlist.",
        });
        await setWaitlistStatus(entryId, "offered");
        sent++;
      } catch { /* skip a single failed send */ }
    }
    return sent;
  } catch { return 0; }
}
