import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { listAppointments, updateAppointment, listAppointmentTypes } from "@/lib/scheduling";
import { getClinician } from "@/lib/clinicians";
import { assessClientIntake, intakeLinkPath, formShortLabel } from "@/lib/intakeRouting";
import { sendBrandedEmail } from "@/lib/email";
import { caymanWhen } from "@/lib/caymanTime";

export const dynamic = "force-dynamic";

// Intake reminders. An external scheduler (Vercel Cron, cron-job.org, launchd)
// hits this with the shared secret; a daily run is plenty. It emails clients
// whose intake is still outstanding within a day of their appointment, and
// clears the stored status for anyone who has since completed it. Requires
// CRON_SECRET. Each appointment is reminded at most once (intake_reminder_at
// stamp), so it is safe to run at any cadence and will never double-send.
const REMIND_WITHIN_MS = 30 * 3600 * 1000; // remind up to ~30h before the visit

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return key === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = Date.now();
  const origin = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");

  const from = new Date(now).toISOString().slice(0, 10);
  const to = new Date(now + 3 * 86400000).toISOString().slice(0, 10);
  const [appts, types] = await Promise.all([listAppointments({ from, to }), listAppointmentTypes()]);

  let reminded = 0, cleared = 0, skipped = 0;
  for (const a of appts) {
    if (a.kind === "block" || a.status === "cancelled" || a.intakeStatus !== "pending") continue;
    if (a.intakeReminderAt) continue; // already reminded — never send twice
    const start = Date.parse(a.startAt);
    if (!(start > now && start <= now + REMIND_WITHIN_MS)) continue;

    const type = types.find((t) => t.id === a.typeId);
    if (!type) continue;
    const assess = await assessClientIntake(a.clientName, type.name, a.clientEmail);
    if (!assess.needsIntake) {
      // They completed it since booking — keep the record honest.
      await updateAppointment(a.id, { intakeStatus: "received" } as never);
      cleared++;
      continue;
    }
    if (!a.clientEmail) { skipped++; continue; }

    // Reuse the couple id stored at booking so the reminder link matches the
    // original invite; fall back to a fresh one only if it wasn't stored.
    const coupleId = assess.missingForms.includes("couples")
      ? (a.coupleId || randomBytes(6).toString("hex"))
      : undefined;
    await sendBrandedEmail(a.clientEmail, "Reminder: please complete your intake form", {
      heading: "A quick reminder",
      greetingName: a.clientName.split(/\s+/)[0] || undefined,
      intro: `Please complete your intake before your upcoming ${type.name} appointment:`,
      rows: [
        { label: "Service", value: type.name },
        { label: "Clinician", value: getClinician(a.clinicianId)?.name || "your clinician" },
        { label: "When", value: caymanWhen(a.startAt) },
      ],
      buttons: assess.missingForms.map((f) => ({ label: `Complete your ${formShortLabel(f)}`, url: `${origin}${intakeLinkPath(a.clinicianId, f, coupleId)}` })),
      note: "It only takes a few minutes and is kept confidential.",
    });
    await updateAppointment(a.id, { intakeReminderAt: new Date().toISOString() } as never);
    reminded++;
  }

  return NextResponse.json({ ok: true, reminded, cleared, skipped });
}
