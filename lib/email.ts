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
// IMPORTANT (HIPAA/DPA): the notification intentionally contains NO client
// answers and NO client name - only a secure link. PHI stays in the encrypted DB.

import nodemailer from "nodemailer";

// ---- Branding (edit these to re-brand the notification email) --------------
const PRACTICE_NAME = "The Institute for Essential Care";
const FROM_NAME = "TIFEC Intake"; // friendly "From" name shown in the inbox
const BRAND_BLUE = "#34659b";
const BRAND_CREAM = "#f3efe6";
const BRAND_CHARCOAL = "#2d2d2a";
const BRAND_MUTED = "#6b6b66";
const BRAND_LINE = "#e4ded2";

export interface NotifyArgs {
  to: string; // clinician email
  clinicianName: string;
  token: string; // secure-view token
  submittedAt: string; // ISO
  formLabel?: string; // which form was submitted (e.g. "Individual Client Intake")
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
  const formName = args.formLabel || "client intake form";
  const subject = `New client intake form submitted${args.formLabel ? ` (${args.formLabel})` : ""}`;

  const text = [
    `Hello ${args.clinicianName},`,
    ``,
    `A new ${formName} was submitted for you on ${when}.`,
    ``,
    `For your client's privacy, none of their answers are included in this email.`,
    `View the submission securely in your dashboard:`,
    link,
    ``,
    `— ${PRACTICE_NAME}`,
  ].join("\n");

  const html = `
  <div style="margin:0;padding:24px 12px;background:${BRAND_CREAM};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${BRAND_CHARCOAL}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid ${BRAND_LINE};border-radius:14px;overflow:hidden">
      <tr><td style="height:4px;background:${BRAND_BLUE};font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td style="padding:24px 28px 6px;text-align:center">
        <img src="${appUrl}/tifec-logo.png" alt="${PRACTICE_NAME}" style="height:46px;width:auto" />
      </td></tr>
      <tr><td style="padding:6px 28px 24px">
        <p style="font-size:16px;margin:0 0 14px">Hello ${args.clinicianName},</p>
        <p style="font-size:15px;line-height:1.6;margin:0 0 14px">A new <strong>${formName}</strong> was submitted for you on <strong>${when}</strong>.</p>
        <p style="font-size:14px;line-height:1.6;color:${BRAND_MUTED};margin:0 0 22px">For your client's privacy, none of their answers are included in this email. View the submission securely in your dashboard:</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 22px"><tr>
          <td style="border-radius:9px;background:${BRAND_BLUE}">
            <a href="${link}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:9px">View submission securely</a>
          </td>
        </tr></table>
        <p style="font-size:12.5px;color:#8a877f;margin:0 0 4px">If the button doesn't work, paste this link into your browser:</p>
        <p style="font-size:12.5px;margin:0;word-break:break-all"><a href="${link}" style="color:${BRAND_BLUE}">${link}</a></p>
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid ${BRAND_LINE};background:#faf8f3;text-align:center">
        <p style="font-size:12px;color:${BRAND_MUTED};margin:0 0 3px"><strong>${PRACTICE_NAME}</strong></p>
        <p style="font-size:11px;color:#9a978f;margin:0;line-height:1.5">Confidential clinical notification. If you received this in error, please delete it.</p>
      </td></tr>
    </table>
  </div>`;

  // If SMTP isn't configured (e.g. local dev), log instead of failing so the
  // submission flow still works end-to-end.
  if (!process.env.SMTP_HOST) {
    console.log("\n[email:dev] SMTP not configured - notification not sent.");
    console.log(`[email:dev] would notify ${args.to}: ${link}\n`);
    return { sent: false, reason: "SMTP not configured (dev mode)" };
  }

  await transport().sendMail({
    from: { name: FROM_NAME, address: process.env.SMTP_FROM || process.env.SMTP_USER || "" },
    to: args.to,
    subject,
    text,
    html,
  });
  return { sent: true };
}
