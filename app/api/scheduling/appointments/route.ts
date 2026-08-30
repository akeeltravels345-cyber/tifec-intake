import { NextResponse } from "next/server";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import {
  listAppointments, createAppointment, updateAppointment, deleteAppointment,
} from "@/lib/scheduling";

export const dynamic = "force-dynamic";

// Prototype: admin only, read and write.
async function requireAdmin() {
  const user = await getBillingUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  if (!isSystemAdmin(user.clinician)) return { error: NextResponse.json({ error: "Not permitted." }, { status: 403 }) };
  return { user };
}

export async function GET(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  const p = new URL(req.url).searchParams;
  const appointments = await listAppointments({
    from: p.get("from") || undefined,
    to: p.get("to") || undefined,
    clinicianId: p.get("clinicianId") || undefined,
  });
  return NextResponse.json({ appointments });
}

export async function POST(req: Request) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const action = String(body.action || "");

  try {
    if (action === "create") {
      if (!body.clinicianId) return NextResponse.json({ error: "Pick a clinician." }, { status: 400 });
      if (!body.startAt || !body.endAt) return NextResponse.json({ error: "When is it?" }, { status: 400 });
      if (body.kind !== "block" && !String(body.clientName || "").trim()) {
        return NextResponse.json({ error: "Who is it for?" }, { status: 400 });
      }
      const appt = await createAppointment({ ...body, createdBy: user.clinician.id, source: "staff" } as never);
      return NextResponse.json({ ok: true, appointment: appt });
    }
    if (action === "update" || action === "status") {
      const appt = await updateAppointment(String(body.id), body as never);
      if (!appt) return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
      return NextResponse.json({ ok: true, appointment: appt });
    }
    if (action === "delete") {
      await deleteAppointment(String(body.id));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    console.error("appointments action failed", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
