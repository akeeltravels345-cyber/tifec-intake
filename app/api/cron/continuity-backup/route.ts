import { NextResponse } from "next/server";
import { buildContinuityHtml } from "@/lib/continuity";
import { sendDocumentEmail } from "@/lib/email";
import { caymanToday } from "@/lib/caymanTime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Weekly business-continuity backup. An external scheduler hits this with the
// shared secret; it builds the continuity pack and emails it as an .html
// attachment to CONTINUITY_BACKUP_EMAIL (one address, or several comma-separated).
// Nothing is sent until that secure recipient is configured — the pack is full
// PHI, so it must not go to an unvetted inbox. Requires CRON_SECRET.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return key === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const recipients = (process.env.CONTINUITY_BACKUP_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (recipients.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, skipped: "CONTINUITY_BACKUP_EMAIL not set — nothing sent" });
  }

  const today = caymanToday();
  const html = await buildContinuityHtml();
  const filename = `TIFEC-continuity-${today}.html`;
  const text = [
    "Weekly business continuity backup attached.",
    "",
    "Open the attached file in any web browser to read it, and Print / Save as PDF for an offline copy.",
    "It holds full client details (schedule, contacts, insurance, balances) — keep it secure.",
  ].join("\n");

  const results = await Promise.all(recipients.map((to) => sendDocumentEmail(to, `TIFEC business continuity pack — ${today}`, text, filename, html, "text/html; charset=utf-8")));
  const sent = results.filter((r) => r.sent).length;
  const failed = results.map((r, i) => (r.sent ? null : `${recipients[i]}: ${r.reason}`)).filter(Boolean);
  return NextResponse.json({ ok: failed.length === 0, sent, failed });
}
