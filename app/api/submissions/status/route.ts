import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { updateSubmissionStatus, logAccess, type SubmissionStatus } from "@/lib/db";
import { randomId } from "@/lib/crypto";

export const runtime = "nodejs";

const VALID: SubmissionStatus[] = ["new", "reviewed", "archived"];

export async function POST(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { token?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { token, status } = body;
  if (!token || !status || !VALID.includes(status as SubmissionStatus)) {
    return NextResponse.json({ error: "Invalid token or status." }, { status: 400 });
  }

  // Scoped to the owning clinician only - admins have no access to client data.
  const ok = await updateSubmissionStatus(token, me.id, status as SubmissionStatus);
  if (!ok) return NextResponse.json({ error: "Submission not found." }, { status: 404 });

  await logAccess({
    id: randomId(),
    clinician_id: me.id,
    submission_token: token,
    action: "status",
    detail: `status → ${status}`,
    at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
