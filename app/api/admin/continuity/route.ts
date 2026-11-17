import { NextResponse } from "next/server";
import { getBillingUser, canSeeBusiness } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import { buildContinuityHtml } from "@/lib/continuity";
import { sendDocumentEmail } from "@/lib/email";
import { caymanToday } from "@/lib/caymanTime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function gate() {
  const user = await getBillingUser();
  if (!user) return { ok: false as const, res: new Response("Not signed in.", { status: 401 }) };
  if (!canSeeBusiness(user.role) && !isSystemAdmin(user.clinician)) {
    return { ok: false as const, res: new Response("Only the owner or system administrator can access the continuity pack.", { status: 403 }) };
  }
  return { ok: true as const };
}

// Printable business-continuity pack (schedule + client/claim essentials +
// who-owes + reference). Full PHI in clear text, so owner / system-admin only.
export async function GET() {
  const g = await gate();
  if (!g.ok) return g.res;
  const html = await buildContinuityHtml();
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

// On-demand "send me the backup now" — emails the pack to CONTINUITY_BACKUP_EMAIL
// (the same secure recipient the weekly cron uses). Lets an admin confirm delivery
// without the cron secret. Never sends unless that vetted recipient is configured.
export async function POST() {
  const g = await gate();
  if (!g.ok) return g.res;

  const recipients = (process.env.CONTINUITY_BACKUP_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (recipients.length === 0) {
    return NextResponse.json({ ok: false, error: "No backup recipient is set. Add CONTINUITY_BACKUP_EMAIL (a secure work mailbox) in the hosting environment, then try again." }, { status: 400 });
  }

  const today = caymanToday();
  const html = await buildContinuityHtml();
  const filename = `TIFEC-continuity-${today}.html`;
  const text = [
    "Business continuity backup attached (sent on request).",
    "",
    "Open the attached file in any web browser to read it, and Print / Save as PDF for an offline copy.",
    "It holds full client details (schedule, contacts, insurance, balances) — keep it secure.",
  ].join("\n");

  const results = await Promise.all(recipients.map((to) => sendDocumentEmail(to, `TIFEC business continuity pack — ${today}`, text, filename, html, "text/html; charset=utf-8")));
  const sent = results.filter((r) => r.sent).length;
  const failed = results.map((r, i) => (r.sent ? null : `${recipients[i]}: ${r.reason}`)).filter(Boolean);
  if (sent === 0) {
    return NextResponse.json({ ok: false, error: `Could not send: ${failed.join("; ")}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sent, recipients, failed });
}
