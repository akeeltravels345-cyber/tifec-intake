import { NextResponse } from "next/server";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import { sendBrandedEmail } from "@/lib/email";
import { appointmentInvite } from "@/lib/ical";

export const dynamic = "force-dynamic";

// Diagnostic: send a test client email (plain, and one with a calendar invite
// like a booking confirmation) and report exactly what the transport returned.
// Admin/owner session, or a SCHED_IMPORT_SECRET bearer for a scripted check.
export async function POST(req: Request) {
  const secret = process.env.SCHED_IMPORT_SECRET;
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!(secret && bearer && bearer === secret)) {
    const user = await getBillingUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    if (!isSystemAdmin(user.clinician) && user.clinician.contact !== "owner") return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }

  let body: { to?: string };
  try { body = await req.json(); } catch { body = {}; }
  const to = (body.to || process.env.SMTP_FROM || process.env.SMTP_USER || "").trim();
  if (!to) return NextResponse.json({ error: "No recipient." }, { status: 400 });

  const env = {
    hasHost: !!process.env.SMTP_HOST, hasUser: !!process.env.SMTP_USER,
    hasPass: !!process.env.SMTP_PASS, hasFrom: !!process.env.SMTP_FROM,
    port: process.env.SMTP_PORT || null,
  };

  const plain = await sendBrandedEmail(to, "TIFEC email test (plain)", {
    heading: "Email test", intro: "This is a plain diagnostic email.", rows: [{ label: "Test", value: "plain" }],
  });

  const start = new Date(Date.now() + 24 * 3600e3).toISOString();
  const end = new Date(Date.now() + 25 * 3600e3).toISOString();
  const ics = appointmentInvite({
    id: "emailtest", startAt: start, endAt: end, serviceName: "Test", clinicianName: "Test",
    clientName: "Test", clientEmail: to, organizerEmail: process.env.SMTP_FROM || process.env.SMTP_USER, method: "REQUEST",
  });
  const withInvite = await sendBrandedEmail(to, "TIFEC email test (with invite)", {
    heading: "Email test", intro: "This diagnostic email carries a calendar invite, like a booking confirmation.", rows: [{ label: "Test", value: "invite" }],
  }, { content: ics, method: "REQUEST", filename: "appointment.ics" });

  return NextResponse.json({ to, env, plain, withInvite });
}
