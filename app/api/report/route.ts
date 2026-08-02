import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { insertFeedback } from "@/lib/feedback";
import { sendFeedback } from "@/lib/email";

export const runtime = "nodejs";

// Auto-reports a broken (404) or crashing (error) page to the support inbox
// AND the feedback store, so a real user hitting a dead end tells us straight
// away — it shows up in /admin "Reported issues" and emails SUPPORT_EMAIL.
export async function POST(req: Request) {
  let body: { kind?: string; path?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Best-effort identity. Only auto-report for a signed-in person, so random
  // bot/crawler 404s don't spam the inbox — real users are always signed in.
  const me = await getCurrentClinician().catch(() => null);
  if (!me) return NextResponse.json({ ok: true, skipped: true });

  const crash = body.kind === "error";
  const path = String(body.path || "").slice(0, 300);
  const detail = String(body.message || "").slice(0, 1000);
  const category = crash ? "Auto-report: page crash" : "Auto-report: broken link (404)";
  const message = `Path: ${path || "(unknown)"}\n${detail ? `Error: ${detail}\n` : ""}(auto-reported)`;

  try {
    await insertFeedback(category, message, me.id);
  } catch (err) {
    console.error("auto-report store failed:", err);
  }
  try {
    await sendFeedback({ fromName: me.name, fromId: me.id, category, message });
  } catch (err) {
    console.error("auto-report email failed:", err);
  }

  return NextResponse.json({ ok: true });
}
