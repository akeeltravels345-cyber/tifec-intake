import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { markTourSeen } from "@/lib/users";

export const runtime = "nodejs";

// Marks the first-login walkthrough as seen for the current account (idempotent).
export async function POST() {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  await markTourSeen(me.id);
  return NextResponse.json({ ok: true });
}
