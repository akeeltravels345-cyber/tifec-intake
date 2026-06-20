// SMTP notification sender (uses TIFEC's email account via nodemailer).
//
// Required env vars (set in .env.local / Vercel project settings):
//   SMTP_HOST       e.g. smtp.office365.com or smtp.gmail.com
//   SMTP_PORT       e.g. 587
//   SMTP_USER       the TIFEC mailbox login
//   SMTP_PASS       the mailbox password / app password
//   SMTP_FROM       the "from" address shown to clinicians (often = SMTP_USER)
//   APP_URL         public base URL of this app, e.g. https://intake.tifec.org
//
// IMPORTANT (HIPAA): the notification intentionally contains NO client answers
// and NO client name - only a secure link. The PHI stays in the encrypted DB.

import nodemailer from "nodemailer";

export interface NotifyArgs {
  to: string; // clinician email
  clinicianName: string;
  token: string; // secure-view token
  submittedAt: string; // ISO
}

function transport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendNotification(args: NotifyArgs): Promise<{ sent: boolean; reason?: string }> {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const link = `${appUrl}/submissions/${args.token}`;
  const when = new Date(args.submittedAt).toLocaleString("en-US");

  const text = [
    `Hello ${args.clinicianName},`,
    ``,
    `A new client intake form was submitted for you on ${when}.`,
    ``,
    `For privacy, the answers are not included in this email.`,
    `View the submission securely here:`,
    link,
    ``,
    `- TIFEC Intake System`,
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,Arial,sans-serif;line-height:1.5;color:#1a1a1a">
      <p>Hello ${args.clinicianName},</p>
      <p>A new client intake form was submitted for you on <strong>${when}</strong>.</p>
      <p>For privacy, the answers are <strong>not</strong> included in this email.</p>
      <p><a href="${link}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">View submission securely</a></p>
      <p style="color:#666;font-size:13px">If the button doesn't work, paste this link into your browser:<br>${link}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
      <p style="color:#888;font-size:12px">TIFEC Intake System</p>
    </div>`;

  // If SMTP isn't configured (e.g. local dev), log instead of failing so the
  // submission flow still works end-to-end.
  if (!process.env.SMTP_HOST) {
    console.log("\n[email:dev] SMTP not configured - notification not sent.");
    console.log(`[email:dev] would notify ${args.to}: ${link}\n`);
    return { sent: false, reason: "SMTP not configured (dev mode)" };
  }

  await transport().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: args.to,
    subject: "New client intake form submitted",
    text,
    html,
  });
  return { sent: true };
}
