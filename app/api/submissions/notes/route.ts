import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { updateSubmissionNotes, logAccess } from "@/lib/db";
import { encrypt, randomId } from "@/lib/crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { token?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body.token) return NextResponse.json({ error: "Missing token." }, { status: 400 });

  const text = (body.notes || "").trim();
  // Encrypt notes at rest (same as PHI). Empty notes are stored as null.
  const encrypted = text ? encrypt(text) : null;

  // Scoped to the owning clinician only - admins have no access to client data.
  const ok = await updateSubmissionNotes(body.token, me.id, encrypted);
  if (!ok) return NextResponse.json({ error: "Submission not found." }, { status: 404 });

  await logAccess({
    id: randomId(),
    clinician_id: me.id,
    submission_token: body.token,
    action: "notes",
    detail: text ? "updated notes" : "cleared notes",
    at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
