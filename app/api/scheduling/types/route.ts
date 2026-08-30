import { NextResponse } from "next/server";
import { getBillingUser, isOwner } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import {
  listAppointmentTypes, createAppointmentType, updateAppointmentType,
  deleteAppointmentType, reorderAppointmentTypes,
} from "@/lib/scheduling";

export const dynamic = "force-dynamic";

// Appointment types are practice configuration: the owner and the system admin
// manage them. Billers and clinicians can read the list (for booking) but not
// change it.
async function requireEditor() {
  const user = await getBillingUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  if (!isOwner(user.role) && !isSystemAdmin(user.clinician)) {
    return { error: NextResponse.json({ error: "Not permitted." }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ types: await listAppointmentTypes() });
}

export async function POST(req: Request) {
  const { error } = await requireEditor();
  if (error) return error;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const action = String(body.action || "");

  try {
    if (action === "create") {
      const t = String(body.name ?? "").trim();
      if (!t) return NextResponse.json({ error: "Give the appointment type a name." }, { status: 400 });
      const type = await createAppointmentType(body as never);
      return NextResponse.json({ ok: true, type });
    }
    if (action === "update") {
      const type = await updateAppointmentType(String(body.id), body as never);
      if (!type) return NextResponse.json({ error: "Type not found." }, { status: 404 });
      return NextResponse.json({ ok: true, type });
    }
    if (action === "delete") {
      await deleteAppointmentType(String(body.id));
      return NextResponse.json({ ok: true });
    }
    if (action === "reorder") {
      const ids = Array.isArray(body.orderedIds) ? body.orderedIds.map((x) => String(x)) : [];
      await reorderAppointmentTypes(ids);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    console.error("scheduling types action failed", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
