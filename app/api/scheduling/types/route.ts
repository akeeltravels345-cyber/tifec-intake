import { NextResponse } from "next/server";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import {
  listAppointmentTypes, createAppointmentType, updateAppointmentType,
  deleteAppointmentType, reorderAppointmentTypes,
} from "@/lib/scheduling";

export const dynamic = "force-dynamic";

// Prototype: the whole scheduler is the system admin's alone for now. Owner,
// billers and clinicians are all refused, read and write, until it's ready.
async function requireAdmin() {
  const user = await getBillingUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  if (!isSystemAdmin(user.clinician)) {
    return { error: NextResponse.json({ error: "Not permitted." }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return NextResponse.json({ types: await listAppointmentTypes() });
}

export async function POST(req: Request) {
  const { error } = await requireAdmin();
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
