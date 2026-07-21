import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { deleteSubmission, logAccess } from "@/lib/db";
import { isDemoToken } from "@/lib/demoCleanup";
import { randomId } from "@/lib/crypto";

export const runtime = "nodejs";

// Admin-only bulk delete of seeded demo records.
// Every token is re-verified server-side as a DEMO record before deletion, so a
// crafted request can never remove a real client's submission.
export async function POST(req: Request) {
  const me = await getCurrentClinician();
  if (!me?.admin) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  let body: { tokens?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const tokens = Array.isArray(body.tokens) ? body.tokens.filter((t): t is string => typeof t === "string") : [];
  if (tokens.length === 0) {
    return NextResponse.json({ error: "Nothing selected." }, { status: 400 });
  }
  if (tokens.length > 200) {
    return NextResponse.json({ error: "Too many records in one request." }, { status: 400 });
  }

  let deleted = 0;
  const refused: string[] = [];

  for (const token of tokens) {
    // Hard safety gate: only clearly-marked demo records may be removed here.
    if (!(await isDemoToken(token))) {
      refused.push(token);
      continue;
    }
    const ok = await deleteSubmission(token, null); // admin scope
    if (!ok) {
      refused.push(token);
      continue;
    }
    deleted++;
    await logAccess({
      id: randomId(),
      clinician_id: me.id,
      submission_token: token,
      action: "delete",
      detail: "admin removed a demo record",
      at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: true, deleted, refused: refused.length });
}
