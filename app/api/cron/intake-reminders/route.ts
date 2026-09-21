import { NextResponse } from "next/server";
import { listAppointments } from "@/lib/scheduling";
import { sendIntakeReminderFor } from "@/lib/intakeReminders";

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
  const appts = await listAppointments({ from, to });

  let reminded = 0, cleared = 0, skipped = 0;
  for (const a of appts) {
    if (a.kind === "block" || a.status === "cancelled" || a.intakeStatus !== "pending") continue;
    if (a.intakeReminderAt) continue; // already reminded — never send twice
    const start = Date.parse(a.startAt);
    if (!(start > now && start <= now + REMIND_WITHIN_MS)) continue;

    // Auto mode: respect the once-only stamp (not forced).
    const r = await sendIntakeReminderFor(a.id, { origin });
    if (r === "sent") reminded++;
    else if (r === "received") cleared++;
    else if (r === "no_email") skipped++;
  }

  return NextResponse.json({ ok: true, reminded, cleared, skipped });
}
