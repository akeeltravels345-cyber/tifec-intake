import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { isSystemAdmin } from "@/lib/clinicians";
import { listAllClients, updateClient, type ClientProfile } from "@/lib/clients";
import { findIntakeEmailsForClient, findIntakeContactForClient } from "@/lib/intakeLink";
import { logChange } from "@/lib/db";

export const dynamic = "force-dynamic";

// Backfill billing client CONTACT DETAILS from the intake system: email, date of
// birth, sex, phone and address. Admin only (it reads across every clinician's
// intake answers).
//
//   POST {}                -> dry run: report what WOULD change, write nothing
//   POST { "apply": true } -> apply the fills
//
// Safe by design: only fills fields that are EMPTY on the billing record (never
// overwrites), and skips any field whose intake shows conflicting values (those
// are surfaced for manual review rather than guessed).
export async function POST(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isSystemAdmin(me)) return NextResponse.json({ error: "Admin only." }, { status: 403 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body = dry run */ }
  const apply = body.apply === true;

  const clients = await listAllClients();
  let updated = 0, skipped = 0;
  const proposed: { name: string; fields: string[] }[] = [];
  const ambiguous: { name: string; note: string }[] = [];

  const has = (v?: string) => !!(v && v.trim());

  for (const c of clients) {
    const p = c.profile;
    const fill: Partial<ClientProfile> = {};
    const fields: string[] = [];
    const conflicts: string[] = [];

    // Email uses the dedicated resolver (handles couples forms + multi-address).
    if (!has(p.email)) {
      const emails = await findIntakeEmailsForClient(c.first, c.last, p.dob);
      if (emails.length === 1) { fill.email = emails[0]; fields.push("email"); }
      else if (emails.length > 1) conflicts.push("email");
    }

    // Date of birth, sex, phone, address.
    const contact = await findIntakeContactForClient(c.first, c.last, p.dob);
    conflicts.push(...contact.conflicts);
    if (!has(p.dob) && contact.dob) { fill.dob = contact.dob; fields.push("date of birth"); }
    if (!p.sex && contact.sex) { fill.sex = contact.sex; fields.push("sex"); }
    if (!has(p.phone) && contact.phone) { fill.phone = contact.phone; fields.push("phone"); }
    const hasAddress = !!(p.address && (has(p.address.line1) || has(p.address.city)));
    if (!hasAddress && contact.address) { fill.address = { ...(p.address ?? {}), line1: contact.address }; fields.push("address"); }

    if (fields.length > 0) {
      proposed.push({ name: `${c.first} ${c.last}`, fields });
      if (apply) {
        const ok = await updateClient(c.id, c.insurerId, { ...p, ...fill });
        if (ok) { updated++; await logChange(me.id, `client:${c.id}`, "edit", `imported ${fields.join(", ")} from intake`); }
      }
    } else {
      skipped++;
    }
    if (conflicts.length > 0) ambiguous.push({ name: `${c.first} ${c.last}`, note: conflicts.join(", ") });
  }

  return NextResponse.json({
    ok: true,
    apply,
    totals: {
      clients: clients.length,
      matched: proposed.length,
      ambiguous: ambiguous.length,
      skipped,
      updated,
    },
    proposed: proposed.slice(0, 300),
    ambiguous: ambiguous.slice(0, 100),
  });
}
