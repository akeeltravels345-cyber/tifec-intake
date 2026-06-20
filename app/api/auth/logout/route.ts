import { NextResponse } from "next/server";
import { clearSessionCookie, getCurrentClinician } from "@/lib/auth";
import { logAuth } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  const me = await getCurrentClinician();
  if (me) await logAuth(me.id, "logout", "signed out");
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
