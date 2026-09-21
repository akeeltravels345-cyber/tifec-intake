import { NextResponse } from "next/server";
import { hasAppointmentsFor } from "@/lib/portalData";
import { portalToken } from "@/lib/portalAuth";
import { sendBrandedEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const clean = (v: unknown) => String(v ?? "").trim().slice(0, 160);

// Always returns the same response whether or not we hold appointments for the
// email, so the endpoint can't be used to discover who is (or isn't) a client.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const email = clean(body.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });

  try {
    if (await hasAppointmentsFor(email)) {
      const origin = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
      const link = `${origin}/portal/${portalToken(email)}`;
      await sendBrandedEmail(email, "Your appointments at The Institute for Essential Care", {
        heading: "Here's your link",
        greetingName: undefined,
        intro: "Tap below to see your appointments, complete any intake, and manage your bookings. The link is just for you and works for 30 days.",
        buttons: [{ label: "Open my appointments", url: link }],
        note: "If you didn't request this, you can ignore this email. For your security, don't forward this link to anyone.",
      });
    }
  } catch { /* never reveal an error that could leak whether the email exists */ }

  return NextResponse.json({ ok: true });
}
