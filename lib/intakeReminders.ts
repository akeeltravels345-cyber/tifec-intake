// Intake gating helpers, shared by the nightly cron and the clinician-facing
// "who's missing intake" page (where a clinician can send a reminder by hand).
import { randomBytes } from "crypto";
import { getAppointment, updateAppointment, listAppointments, listAppointmentTypes } from "@/lib/scheduling";
import { getClinician } from "@/lib/clinicians";
import { assessClientIntake, intakeLinkPath, formShortLabel } from "@/lib/intakeRouting";
import { sendBrandedEmail } from "@/lib/email";
import { caymanWhen } from "@/lib/caymanTime";

export type ReminderResult = "sent" | "received" | "no_email" | "not_pending" | "already" | "not_found";

export interface IntakeGap {
  id: string; clientName: string; clientEmail: string; clinicianId: string;
  serviceName: string; startAt: string;
  missingLabels: string[]; reminderSentAt: string | null; hasEmail: boolean;
}

/** Send one intake reminder for an appointment. `force` (a clinician clicked
 *  "send") ignores the once-only stamp so they can nudge again. Auto-clears the
 *  status if the client has since completed everything. Best-effort on email. */
export async function sendIntakeReminderFor(id: string, opts: { origin: string; force?: boolean }): Promise<ReminderResult> {
  const a = await getAppointment(id);
  if (!a || a.kind !== "appointment") return "not_found";
  if (a.status === "cancelled" || a.intakeStatus !== "pending") return "not_pending";
  if (!opts.force && a.intakeReminderAt) return "already";

  const type = (await listAppointmentTypes()).find((t) => t.id === a.typeId);
  if (!type) return "not_pending";
  const assess = await assessClientIntake(a.clientName, type.name, a.clientEmail);
  if (!assess.needsIntake) { await updateAppointment(a.id, { intakeStatus: "received" } as never); return "received"; }
  if (!a.clientEmail) return "no_email";

  // Reuse the couple id from booking so the reminder link matches the invite.
  const coupleId = assess.missingForms.includes("couples") ? (a.coupleId || randomBytes(6).toString("hex")) : undefined;
  await sendBrandedEmail(a.clientEmail, "Reminder: please complete your intake form", {
    heading: "A quick reminder",
    greetingName: a.clientName.split(/\s+/)[0] || undefined,
    intro: `Please complete your intake before your upcoming ${type.name} appointment:`,
    rows: [
      { label: "Service", value: type.name },
      { label: "Clinician", value: getClinician(a.clinicianId)?.name || "your clinician" },
      { label: "When", value: caymanWhen(a.startAt) },
    ],
    buttons: assess.missingForms.map((f) => ({ label: `Complete your ${formShortLabel(f)}`, url: `${opts.origin}${intakeLinkPath(a.clinicianId, f, coupleId)}` })),
    note: "It only takes a few minutes and is kept confidential.",
  });
  await updateAppointment(a.id, { intakeReminderAt: new Date().toISOString() } as never);
  return "sent";
}

/** Upcoming appointments (within `days`) whose intake is still outstanding, for
 *  the clinician gating view. Auto-clears any completed since booking. */
export async function listIntakeGaps(clinicianId: string | undefined, days = 21): Promise<IntakeGap[]> {
  const now = Date.now();
  const from = new Date(now).toISOString();
  const to = new Date(now + days * 86400000).toISOString();
  const [appts, types] = await Promise.all([listAppointments({ from, to, clinicianId }), listAppointmentTypes()]);
  const out: IntakeGap[] = [];
  for (const a of appts) {
    if (a.kind === "block" || a.status === "cancelled" || a.intakeStatus !== "pending") continue;
    if (Date.parse(a.startAt) <= now) continue;
    const type = types.find((t) => t.id === a.typeId);
    if (!type) continue;
    const assess = await assessClientIntake(a.clientName, type.name, a.clientEmail);
    if (!assess.needsIntake) { await updateAppointment(a.id, { intakeStatus: "received" } as never); continue; }
    out.push({
      id: a.id, clientName: a.clientName, clientEmail: a.clientEmail, clinicianId: a.clinicianId,
      serviceName: type.name, startAt: a.startAt,
      missingLabels: assess.missingForms.map((f) => formShortLabel(f)),
      reminderSentAt: a.intakeReminderAt, hasEmail: !!a.clientEmail,
    });
  }
  return out.sort((x, y) => x.startAt.localeCompare(y.startAt));
}
