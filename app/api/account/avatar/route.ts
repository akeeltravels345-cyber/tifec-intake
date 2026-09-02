import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { setAvatar } from "@/lib/users";
import { logAccess } from "@/lib/db";

export const runtime = "nodejs";

// Max stored size for a profile photo. The client resizes to a small square
// JPEG before sending, so this is a generous safety cap (~300KB of data URL).
const MAX_LEN = 300_000;

// Set or clear the signed-in user's profile photo. Stored as a small square
// JPEG data URL; sending null clears it.
export async function POST(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { avatar?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  if (body.avatar === null || body.avatar === "") {
    await setAvatar(me.id, null);
    await logAccess({ id: crypto.randomUUID(), clinician_id: me.id, submission_token: "", action: "status", detail: "removed profile photo", at: new Date().toISOString() });
    return NextResponse.json({ ok: true, avatar: null });
  }

  const avatar = String(body.avatar ?? "");
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(avatar)) {
    return NextResponse.json({ error: "That doesn't look like an image." }, { status: 400 });
  }
  if (avatar.length > MAX_LEN) {
    return NextResponse.json({ error: "That image is too large." }, { status: 400 });
  }

  await setAvatar(me.id, avatar);
  await logAccess({ id: crypto.randomUUID(), clinician_id: me.id, submission_token: "", action: "status", detail: "updated profile photo", at: new Date().toISOString() });
  return NextResponse.json({ ok: true, avatar });
}
