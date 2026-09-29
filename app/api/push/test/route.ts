import { NextResponse } from "next/server";
import { getBillingUser } from "@/lib/billingRole";
import { sendPushToClinician } from "@/lib/push";

export const dynamic = "force-dynamic";

// Send a test notification to the signed-in clinician's own devices, so they
// can confirm notifications are working right after turning them on.
export async function POST() {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const sent = await sendPushToClinician(user.clinician.id, {
    title: "Notifications are on",
    body: "You'll get alerts here for new bookings and your daily agenda.",
    url: "/today",
    tag: "test",
  });
  return NextResponse.json({ ok: true, sent });
}
