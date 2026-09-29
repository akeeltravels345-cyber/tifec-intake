import { NextResponse } from "next/server";
import { getBillingUser } from "@/lib/billingRole";
import { savePushSub, removePushSub } from "@/lib/pushSubs";

export const dynamic = "force-dynamic";

// Store this device's push subscription against the signed-in clinician.
export async function POST(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const sub = body?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }
  await savePushSub({ clinicianId: user.clinician.id, endpoint: String(sub.endpoint), p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) });
  return NextResponse.json({ ok: true });
}

// Remove a subscription (clinician turned notifications off on this device).
export async function DELETE(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (body?.endpoint) await removePushSub(String(body.endpoint));
  return NextResponse.json({ ok: true });
}
