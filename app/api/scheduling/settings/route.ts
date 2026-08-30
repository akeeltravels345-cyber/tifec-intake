import { NextResponse } from "next/server";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import { getSchedulingSettings, saveSchedulingSettings } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getBillingUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  if (!isSystemAdmin(user.clinician)) return { error: NextResponse.json({ error: "Not permitted." }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return NextResponse.json({ settings: await getSchedulingSettings() });
}

export async function POST(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const settings = await saveSchedulingSettings(body as never);
  return NextResponse.json({ ok: true, settings });
}
