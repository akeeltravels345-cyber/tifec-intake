import { NextResponse } from "next/server";
import { CLINICIANS, type Clinician } from "@/lib/clinicians";
import { listAppointments, listAppointmentTypes } from "@/lib/scheduling";
import { getClinicianPrefs } from "@/lib/clinicianPrefs";
import { sendBrandedEmail } from "@/lib/email";
import { caymanToday } from "@/lib/caymanTime";

export const dynamic = "force-dynamic";

// End-of-day recap. An external scheduler hits this once each evening (Cayman)
// with the shared secret; it emails every treating clinician a summary of the
// appointments BOOKED with them that day (regardless of when the appointment
// itself falls), unless they've turned the recap off. Requires CRON_SECRET.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return key === secret;
}

const treats = (c: Clinician) => !c.test && !c.intakeHidden && c.contact !== "biller" && c.contact !== "admin";
// Private-booking practicum clinicians (e.g. Nick) take real bookings too, so
// they should get the recap even though they're billers.
const getsRecap = (c: Clinician) => treats(c) || (!!c.privateBooking && !c.test);

const cayDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Cayman", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const whenCayman = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Cayman", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = caymanToday();
  const [appts, types] = await Promise.all([listAppointments({}), listAppointmentTypes()]);
  const typeName = (id: string | null) => types.find((t) => t.id === id)?.name || "Appointment";

  // Appointments booked today (by Cayman calendar day), excluding cancellations,
  // staff blocks, and the one-off Acuity migration (not a real same-day booking).
  const bookedToday = appts.filter((a) =>
    a.kind === "appointment" && a.status !== "cancelled" &&
    a.createdBy !== "acuity-import" && cayDate(a.createdAt) === today);

  let sent = 0, skipped = 0, quiet = 0;
  for (const c of CLINICIANS) {
    if (!getsRecap(c) || !c.email) { skipped++; continue; }
    const mine = bookedToday
      .filter((a) => a.clinicianId === c.id)
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
    if (mine.length === 0) { quiet++; continue; } // nothing booked today — no email

    const prefs = await getClinicianPrefs(c.id);
    if (!prefs.newBookings) { skipped++; continue; }

    const rows = mine.map((a) => ({
      label: whenCayman(a.startAt),
      value: `${a.clientName || "(no name)"} · ${typeName(a.typeId)}${a.mode === "virtual" ? " · Online" : ""}`,
    }));
    try {
      await sendBrandedEmail(c.email, `${mine.length} new booking${mine.length === 1 ? "" : "s"} today`, {
        heading: "Today's new bookings",
        greetingName: (c.name || "").replace(/^(Dr|Mrs|Mr|Ms|Miss)\.?\s+/i, "").split(/\s+/)[0] || undefined,
        intro: `${mine.length} new appointment${mine.length === 1 ? " was" : "s were"} booked with you today. ${mine.length === 1 ? "Here it is" : "Here they are"} (by appointment date):`,
        rows,
        note: "Times are Cayman time. Open your agenda in the app for full details and video links.",
        buttons: [{ label: "Open my calendar", url: `${(process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "")}/schedule` }],
      });
      sent++;
    } catch { skipped++; }
  }

  return NextResponse.json({ ok: true, sent, skipped, quiet, bookedToday: bookedToday.length });
}
