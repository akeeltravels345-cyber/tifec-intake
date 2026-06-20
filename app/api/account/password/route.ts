import { NextResponse } from "next/server";
import { getCurrentClinician, verifyPassword, hashPassword, setSessionCookie } from "@/lib/auth";
import { getUser, setUserPassword } from "@/lib/users";
import { logAuth } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { current?: string; next?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body.next || body.next.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
  }

  const user = await getUser(me.id);
  if (!user || !body.current || !verifyPassword(body.current, user.password_hash)) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
  }

  await setUserPassword(me.id, hashPassword(body.next));
  // Changing the password bumps updated_at, which invalidates every existing
  // session token (including other devices). Re-issue a fresh cookie for THIS
  // device so the user who just changed it stays signed in here.
  await setSessionCookie(me.id);
  await logAuth(me.id, "password", "changed password");
  return NextResponse.json({ ok: true });
}
