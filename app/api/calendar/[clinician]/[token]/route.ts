import { NextResponse } from "next/server";
import { getClinician } from "@/lib/clinicians";
import { listAppointments, listAppointmentTypes } from "@/lib/scheduling";
import { buildIcs, type IcsEvent } from "@/lib/ical";
import { verifyCalendarFeedToken } from "@/lib/calendarFeed";

export const dynamic = "force-dynamic";

// A clinician's calendar subscribe feed. Read-only; the token in the path is the
// only auth, so the URL is a bearer secret. Returns their upcoming appointments
// (and blocks) as an iCalendar feed that Apple / Google / Outlook can subscribe
// to and refresh on their own schedule.
export async function GET(_req: Request, { params }: { params: Promise<{ clinician: string; token: string }> }) {
  const { clinician, token } = await params;
  if (!verifyCalendarFeedToken(clinician, token)) return new NextResponse("Not found", { status: 404 });
  const c = getClinician(clinician);
  if (!c) return new NextResponse("Not found", { status: 404 });

  const now = Date.now();
  const from = new Date(now - 14 * 86400000).toISOString().slice(0, 10);   // a little history
  const to = new Date(now + 120 * 86400000).toISOString().slice(0, 10);    // ~4 months ahead
  let events: IcsEvent[] = [];
  try {
    const [appts, types] = await Promise.all([listAppointments({ clinicianId: clinician, from, to }), listAppointmentTypes()]);
    events = appts.filter((a) => a.status !== "cancelled").map((a) => {
      const type = types.find((t) => t.id === a.typeId);
      const isBlock = a.kind === "block";
      const summary = isBlock
        ? (a.title ? `Unavailable: ${a.title}` : "Unavailable")
        : `${a.clientName || type?.name || "Appointment"}${type ? ` — ${type.name}` : ""}`;
      const location = a.mode === "virtual"
        ? (a.locationOrLink || "Online")
        : (a.locationOrLink || "The Institute for Essential Care");
      return {
        uid: `${a.id}@caymanessentialcare.com`,
        start: a.startAt, end: a.endAt, summary, location,
        status: "CONFIRMED" as const,
      };
    });
  } catch { /* an empty feed is better than a 500 for a subscribed client */ }

  const ics = buildIcs(events, { method: "PUBLISH", calName: `${c.name} · TIFEC` });
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="tifec-${clinician}.ics"`,
      "Cache-Control": "no-cache, must-revalidate",
    },
  });
}
