import { NextResponse } from "next/server";
import { CLINICIANS } from "@/lib/clinicians";
import { listAppointmentTypes, availableSlots, availableSlotsAny } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

// Prototype gate: the public booking flow is unlisted and requires a preview
// token, so no real client can reach it until it's ready.
const PREVIEW = "peek";
const bookable = () => CLINICIANS.filter((c) => !c.intakeHidden && c.contact !== "biller");

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  if (p.get("preview") !== PREVIEW) return NextResponse.json({ error: "Not available." }, { status: 403 });

  const typeId = p.get("typeId") || "";
  const date = p.get("date") || "";
  const clinicianId = p.get("clinicianId") || "any";
  if (!typeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const type = (await listAppointmentTypes()).find((t) => t.id === typeId && t.active);
  if (!type) return NextResponse.json({ error: "Unknown service." }, { status: 404 });

  const ids = bookable().map((c) => c.id);
  if (clinicianId !== "any") {
    if (!ids.includes(clinicianId)) return NextResponse.json({ error: "Unknown clinician." }, { status: 404 });
    const mins = await availableSlots(clinicianId, date, type.durationMin);
    return NextResponse.json({ slots: mins.map((minute) => ({ minute, clinicianId })) });
  }
  return NextResponse.json({ slots: await availableSlotsAny(ids, date, type.durationMin) });
}
