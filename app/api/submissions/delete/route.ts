import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { deleteSubmission, logAccess } from "@/lib/db";
import { randomId } from "@/lib/crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body.token) return NextResponse.json({ error: "Missing token." }, { status: 400 });

  // Record the delete BEFORE removing the row, so the audit trail survives.
  await logAccess({
    id: randomId(),
    clinician_id: me.id,
    submission_token: body.token,
    action: "delete",
    detail: "deleted submission",
    at: new Date().toISOString(),
  });

  // Scoped to the owning clinician only - admins have no access to client data.
  const ok = await deleteSubmission(body.token, me.id);
  if (!ok) return NextResponse.json({ error: "Submission not found." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
