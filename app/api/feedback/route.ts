import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { insertFeedback } from "@/lib/feedback";
import { sendFeedback } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { category?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const message = (body.message || "").trim();
  const category = (body.category || "Issue").slice(0, 40);
  if (!message) return NextResponse.json({ error: "Please describe the issue." }, { status: 400 });
  if (message.length > 4000) return NextResponse.json({ error: "That message is too long." }, { status: 400 });

  // Store it (graceful: a missing table shouldn't block the email).
  try {
    await insertFeedback(category, message, me.id);
  } catch (err) {
    console.error("feedback store failed:", err);
  }
  // Email the support inbox.
  try {
    await sendFeedback({ fromName: me.name, fromId: me.id, category, message });
  } catch (err) {
    console.error("feedback email failed:", err);
  }

  return NextResponse.json({ ok: true });
}
