import { NextResponse } from "next/server";
import { CLINICIANS, isPublicBookable, isBookableClinician } from "@/lib/clinicians";
import { listAppointmentTypes, availableSlots, availableSlotsAny, groupSessionSlots, groupSessionSlotsAny } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

// Prototype gate: the public booking flow is unlisted and requires a preview
// token, so no real client can reach it until it's ready.
const PREVIEW = "peek";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  if (p.get("preview") !== PREVIEW) return NextResponse.json({ error: "Not available." }, { status: 403 });

  const typeId = p.get("typeId") || "";
  const date = p.get("date") || "";
  const clinicianId = p.get("clinicianId") || "any";
  if (!typeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const type = (await listAppointmentTypes()).find((t) => t.id === typeId && t.active);
  if (!type) return NextResponse.json({ error: "Unknown service." }, { status: 404 });

  const isGroup = (type.capacity || 1) > 1;

  if (clinicianId !== "any") {
    // A specific clinician may be private (Nick, reached by direct link).
    const c = CLINICIANS.find((x) => x.id === clinicianId);
    if (!c || !isBookableClinician(c)) return NextResponse.json({ error: "Unknown clinician." }, { status: 404 });
    if (isGroup) {
      const g = await groupSessionSlots(clinicianId, typeId, date);
      return NextResponse.json({ group: true, slots: g.map(({ minute, clinicianId, seatsLeft }) => ({ minute, clinicianId, seatsLeft })) });
    }
    const mins = await availableSlots(clinicianId, date, type.durationMin, Date.now(), type.bufferBeforeMin, type.bufferAfterMin);
    return NextResponse.json({ slots: mins.map((minute) => ({ minute, clinicianId })) });
  }
  // "Any available" only ever draws from the public pool (never a private one).
  const ids = CLINICIANS.filter(isPublicBookable).map((c) => c.id);
  if (isGroup) {
    const g = await groupSessionSlotsAny(ids, typeId, date);
    return NextResponse.json({ group: true, slots: g.map(({ minute, clinicianId, seatsLeft }) => ({ minute, clinicianId, seatsLeft })) });
  }
  return NextResponse.json({ slots: await availableSlotsAny(ids, date, type.durationMin, Date.now(), type.bufferBeforeMin, type.bufferAfterMin) });
}
