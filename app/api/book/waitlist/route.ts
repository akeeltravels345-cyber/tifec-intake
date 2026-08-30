import { NextResponse } from "next/server";
import { addWaitlist, listAppointmentTypes } from "@/lib/scheduling";

export const dynamic = "force-dynamic";
const PREVIEW = "peek";
const clean = (v: unknown, cap = 200) => String(v ?? "").trim().slice(0, cap);

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  if (body.preview !== PREVIEW) return NextResponse.json({ error: "Not available." }, { status: 403 });

  const name = clean(body.name, 120);
  const email = clean(body.email, 160);
  if (!name) return NextResponse.json({ error: "Please give your name." }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Please give a valid email." }, { status: 400 });

  const typeId = clean(body.typeId, 64) || null;
  if (typeId && !(await listAppointmentTypes()).some((t) => t.id === typeId)) {
    return NextResponse.json({ error: "Unknown service." }, { status: 404 });
  }
  const entry = await addWaitlist({
    typeId, clinicianId: clean(body.clinicianId, 64) || null,
    name, email, phone: clean(body.phone, 40), note: clean(body.note, 500),
  });
  return NextResponse.json({ ok: true, id: entry.id });
}
