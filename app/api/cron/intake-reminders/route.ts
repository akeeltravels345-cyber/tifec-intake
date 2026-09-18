import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { listAppointments, updateAppointment, listAppointmentTypes } from "@/lib/scheduling";
import { getClinician } from "@/lib/clinicians";
import { assessClientIntake, intakeLinkPath, formShortLabel } from "@/lib/intakeRouting";
import { sendClientEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// Intake reminders. An external scheduler (Vercel Cron, cron-job.org, launchd)
// hits this once a day with the shared secret. It emails clients whose intake is
// still outstanding roughly a day before their appointment, and clears the
// stored status for anyone who has since completed it. Requires CRON_SECRET.
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
  const windowStart = now + 20 * 3600 * 1000; // ~24h before, with a wide-ish
  const windowEnd = now + 28 * 3600 * 1000;   // band so a daily run catches each
  const origin = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");

  const from = new Date(now).toISOString().slice(0, 10);
  const to = new Date(now + 3 * 86400000).toISOString().slice(0, 10);
  const [appts, types] = await Promise.all([listAppointments({ from, to }), listAppointmentTypes()]);

  let reminded = 0, cleared = 0, skipped = 0;
  for (const a of appts) {
    if (a.kind === "block" || a.status === "cancelled" || a.intakeStatus !== "pending") continue;
    const start = Date.parse(a.startAt);
    if (!(start >= windowStart && start <= windowEnd)) continue;

    const type = types.find((t) => t.id === a.typeId);
    if (!type) continue;
    const assess = await assessClientIntake(a.clientName, type.name);
    if (!assess.needsIntake) {
      // They completed it since booking — keep the record honest.
      await updateAppointment(a.id, { intakeStatus: "received" } as never);
      cleared++;
      continue;
    }
    if (!a.clientEmail) { skipped++; continue; }

    const coupleId = assess.missingForms.includes("couples") ? randomBytes(6).toString("hex") : undefined;
    const links = assess.missingForms
      .map((f) => `${formShortLabel(f)}:\n${origin}${intakeLinkPath(a.clinicianId, f, coupleId)}`)
      .join("\n\n");
    const text =
      `Hi ${a.clientName.split(/\s+/)[0] || "there"},\n\n` +
      `This is a friendly reminder to complete your intake before your appointment with ${getClinician(a.clinicianId)?.name || "your clinician"}:\n\n` +
      `${links}\n\n` +
      `It only takes a few minutes and is kept confidential.\n\n` +
      `Thank you,\nThe Institute for Essential Care`;
    await sendClientEmail(a.clientEmail, "Reminder: please complete your intake form", text);
    reminded++;
  }

  return NextResponse.json({ ok: true, reminded, cleared, skipped });
}
