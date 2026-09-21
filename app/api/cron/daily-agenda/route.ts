import { NextResponse } from "next/server";
import { CLINICIANS, type Clinician } from "@/lib/clinicians";
import { listAppointments, listAppointmentTypes, utcFromCayMinutes } from "@/lib/scheduling";
import { getClinicianPrefs } from "@/lib/clinicianPrefs";
import { sendBrandedEmail } from "@/lib/email";
import { caymanToday } from "@/lib/caymanTime";

export const dynamic = "force-dynamic";

// Morning agenda. An external scheduler hits this once each morning (Cayman) with
// the shared secret; it emails every treating clinician their appointments for
// the day, unless they've turned the agenda off. Requires CRON_SECRET.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return key === secret;
}

// Anyone who actually treats clients (owner, Donnet, Joan, Sofia, ...). The
// biller, admin, hidden test account, and unsigned accounts don't get an agenda.
const treats = (c: Clinician) => !c.test && !c.intakeHidden && c.contact !== "biller" && c.contact !== "admin";
const timeCayman = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Cayman", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = caymanToday();
  const from = utcFromCayMinutes(today, 0);
  const to = utcFromCayMinutes(today, 24 * 60);
  const [appts, types] = await Promise.all([listAppointments({ from, to }), listAppointmentTypes()]);
  const typeName = (id: string | null) => types.find((t) => t.id === id)?.name || "Appointment";
  const prettyDay = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Cayman", weekday: "long", day: "numeric", month: "long" }).format(new Date(from));

  let sent = 0, skipped = 0, quiet = 0;
  for (const c of CLINICIANS) {
    if (!treats(c) || !c.email) { skipped++; continue; }
    const mine = appts
      .filter((a) => a.clinicianId === c.id && a.kind === "appointment" && a.status !== "cancelled")
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
    if (mine.length === 0) { quiet++; continue; } // nothing today — no email

    const prefs = await getClinicianPrefs(c.id);
    if (!prefs.dailyAgenda) { skipped++; continue; }

    const rows = mine.map((a) => ({
      label: timeCayman(a.startAt),
      value: `${a.clientName || "(no name)"} · ${typeName(a.typeId)}${a.mode === "virtual" ? " · Online" : ""}`,
    }));
    try {
      await sendBrandedEmail(c.email, `Your schedule for ${prettyDay}`, {
        heading: "Your day ahead",
        greetingName: (c.name || "").replace(/^(Dr|Mrs|Mr|Ms|Miss)\.?\s+/i, "").split(/\s+/)[0] || undefined,
        intro: `You have ${mine.length} appointment${mine.length === 1 ? "" : "s"} on ${prettyDay}:`,
        rows,
        note: "Times are Cayman time. Open your agenda in the app for full details, video links, and client intake status.",
        buttons: [{ label: "Open my agenda", url: `${(process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "")}/schedule` }],
      });
      sent++;
    } catch { skipped++; }
  }

  return NextResponse.json({ ok: true, sent, skipped, quiet });
}
