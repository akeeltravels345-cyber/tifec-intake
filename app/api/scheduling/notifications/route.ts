import { NextResponse } from "next/server";
import { getBillingUser } from "@/lib/billingRole";
import { listNotifications, unreadCount, markRead, markAllRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// The signed-in clinician's own notification inbox (newest first) + unread count.
export async function GET() {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const [items, unread] = await Promise.all([
    listNotifications(user.clinician.id, 50),
    unreadCount(user.clinician.id),
  ]);
  return NextResponse.json({ ok: true, items, unread });
}

// Mark one notification read ({ action: "read", id }) or all of them ({ action: "readAll" }).
export async function POST(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => null) as { action?: string; id?: string } | null;
  if (body?.action === "readAll") await markAllRead(user.clinician.id);
  else if (body?.action === "read" && body.id) await markRead(user.clinician.id, String(body.id));
  else return NextResponse.json({ error: "Bad request." }, { status: 400 });
  return NextResponse.json({ ok: true, unread: await unreadCount(user.clinician.id) });
}
