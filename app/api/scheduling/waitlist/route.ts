import { NextResponse } from "next/server";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import { listWaitlist, setWaitlistStatus, type WaitStatus } from "@/lib/scheduling";

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
  return NextResponse.json({ entries: await listWaitlist() });
}

export async function POST(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const id = String(body.id || "");
  const status = String(body.status || "") as WaitStatus;
  if (!["waiting", "offered", "booked", "removed"].includes(status)) return NextResponse.json({ error: "Bad status." }, { status: 400 });
  await setWaitlistStatus(id, status);
  return NextResponse.json({ ok: true });
}
