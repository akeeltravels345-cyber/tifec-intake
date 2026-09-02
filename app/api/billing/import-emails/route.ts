import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { isSystemAdmin } from "@/lib/clinicians";
import { listAllClients, updateClient } from "@/lib/clients";
import { findIntakeEmailsForClient } from "@/lib/intakeLink";
import { logChange } from "@/lib/db";

export const dynamic = "force-dynamic";

// Backfill client contact emails from the intake system into the billing client
// records. Admin only (it reads across every clinician's intake answers).
//
//   POST {}               -> dry run: report what WOULD change, write nothing
//   POST { "apply": true } -> apply the single-match updates
//
// Safe by design: only fills clients that have NO email yet (never overwrites),
// and skips any client whose intake shows more than one distinct email
// (ambiguous — surfaced for manual review rather than guessed).
export async function POST(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isSystemAdmin(me)) return NextResponse.json({ error: "Admin only." }, { status: 403 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body = dry run */ }
  const apply = body.apply === true;

  const clients = await listAllClients();
  let alreadyHasEmail = 0, noMatch = 0, updated = 0;
  const proposed: { name: string; email: string }[] = [];
  const ambiguous: { name: string; emails: string[] }[] = [];

  for (const c of clients) {
    if (c.profile.email && c.profile.email.trim()) { alreadyHasEmail++; continue; }
    const emails = await findIntakeEmailsForClient(c.first, c.last, c.profile.dob);
    if (emails.length === 0) { noMatch++; continue; }
    if (emails.length > 1) { ambiguous.push({ name: `${c.first} ${c.last}`, emails }); continue; }

    const email = emails[0];
    proposed.push({ name: `${c.first} ${c.last}`, email });
    if (apply) {
      const ok = await updateClient(c.id, c.insurerId, { ...c.profile, email });
      if (ok) { updated++; await logChange(me.id, `client:${c.id}`, "edit", "imported email from intake"); }
    }
  }

  return NextResponse.json({
    ok: true,
    apply,
    totals: {
      clients: clients.length,
      alreadyHasEmail,
      matched: proposed.length,
      ambiguous: ambiguous.length,
      noMatch,
      updated,
    },
    proposed: proposed.slice(0, 200),
    ambiguous: ambiguous.slice(0, 100),
  });
}
