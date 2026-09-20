import { NextResponse } from "next/server";
import { getBillingUser } from "@/lib/billingRole";
import { getAvailability, saveAvailability } from "@/lib/scheduling";
import { hasGoogleConnection } from "@/lib/videoConnections";

export const dynamic = "force-dynamic";

// A clinician manages the external iCal feeds that block their bookings, and
// sees whether their connected Google Calendar is already blocking.
export async function GET() {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const me = user.clinician;
  const [av, google] = await Promise.all([getAvailability(me.id), hasGoogleConnection(me.id)]);
  return NextResponse.json({ feeds: av.busyFeeds, googleConnected: google });
}

export async function POST(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const me = user.clinician;
  let body: { feeds?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const feeds = Array.isArray(body.feeds) ? body.feeds.map((f) => String(f)) : [];
  const saved = await saveAvailability(me.id, { busyFeeds: feeds });
  return NextResponse.json({ ok: true, feeds: saved.busyFeeds });
}
