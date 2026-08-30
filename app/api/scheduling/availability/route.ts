import { NextResponse } from "next/server";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin, getClinician } from "@/lib/clinicians";
import { getAvailability, saveAvailability } from "@/lib/scheduling";

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
  const id = new URL(req.url).searchParams.get("clinicianId") || "";
  if (!id) return NextResponse.json({ error: "Which clinician?" }, { status: 400 });
  return NextResponse.json({ availability: await getAvailability(id) });
}

export async function POST(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const id = String(body.clinicianId || "");
  if (!id || !getClinician(id)) return NextResponse.json({ error: "Unknown clinician." }, { status: 400 });
  try {
    const availability = await saveAvailability(id, body as never);
    return NextResponse.json({ ok: true, availability });
  } catch (e) {
    console.error("save availability failed", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
