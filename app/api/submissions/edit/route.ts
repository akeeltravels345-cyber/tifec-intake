import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { updateSubmissionAnswers, logAccess } from "@/lib/db";
import { encrypt, randomId } from "@/lib/crypto";

export const runtime = "nodejs";

// Clinician correction of a client's submitted answers (e.g. a typo or a value
// the client entered in the wrong field). Scoped to the owning clinician; the
// edit is recorded in the access audit log.
export async function POST(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { token?: string; answers?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body.token) return NextResponse.json({ error: "Missing token." }, { status: 400 });
  if (!body.answers || typeof body.answers !== "object") {
    return NextResponse.json({ error: "Missing answers." }, { status: 400 });
  }

  // Keep only string values; encrypt at rest exactly like the original submission.
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.answers)) {
    if (typeof v === "string") clean[k] = v;
  }
  const encrypted = encrypt(JSON.stringify(clean));

  const ok = await updateSubmissionAnswers(body.token, me.id, encrypted);
  if (!ok) return NextResponse.json({ error: "Submission not found." }, { status: 404 });

  await logAccess({
    id: randomId(),
    clinician_id: me.id,
    submission_token: body.token,
    action: "edit",
    detail: "edited client responses",
    at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
