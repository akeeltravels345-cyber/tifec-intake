import { NextResponse } from "next/server";
import { listAppointments, listAppointmentTypes } from "@/lib/scheduling";
import { getClinicianPrefs } from "@/lib/clinicianPrefs";
import { notifyClinician, hasApptNotification } from "@/lib/notifications";
import { caymanWhen } from "@/lib/caymanTime";

export const dynamic = "force-dynamic";

// Upcoming-appointment reminders. An external scheduler (Vercel cron) hits this
// every ~15 minutes with the shared secret; it pushes each treating clinician a
// heads-up for any appointment of theirs starting within the lead window that
// they haven't already been reminded about. Idempotent: a "reminder" inbox entry
// per appointment is the dedup key, so running more often never double-pings.
// Requires CRON_SECRET; opt-out via the clinician's apptReminders preference.
const LEAD_MIN = 30; // remind up to this many minutes before the start time

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
  const from = new Date(now).toISOString();
  const to = new Date(now + LEAD_MIN * 60000).toISOString();
  const [appts, types] = await Promise.all([listAppointments({ from, to }), listAppointmentTypes()]);
  const typeName = (id: string | null) => types.find((t) => t.id === id)?.name || "Appointment";

  let sent = 0, skipped = 0;
  const prefsCache = new Map<string, boolean>();
  for (const a of appts) {
    if (a.kind !== "appointment" || a.status === "cancelled") { skipped++; continue; }
    if (Date.parse(a.startAt) <= now) { skipped++; continue; } // already started
    // Honour the clinician's opt-out (cached per run).
    let wants = prefsCache.get(a.clinicianId);
    if (wants === undefined) { wants = (await getClinicianPrefs(a.clinicianId)).apptReminders; prefsCache.set(a.clinicianId, wants); }
    if (!wants) { skipped++; continue; }
    if (await hasApptNotification(a.clinicianId, a.id, "reminder")) { skipped++; continue; }
    await notifyClinician(a.clinicianId, {
      type: "reminder", title: "Upcoming appointment",
      body: `${a.clientName || "A client"} · ${typeName(a.typeId)}\n${caymanWhen(a.startAt)}`,
      apptId: a.id,
    });
    sent++;
  }

  return NextResponse.json({ ok: true, sent, skipped, window: { from, to } });
}
