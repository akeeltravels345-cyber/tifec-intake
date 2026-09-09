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
import fs from "fs";
import path from "path";

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

/** A notice title is author-written text going into an HTML email, so it must
 *  be escaped or it becomes markup in someone's inbox. */
function escapeHtml(v: string): string {
  return String(v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** "Dr. Joan Latty" -> "Joan". Internal mail between colleagues; the formal
 *  title stays on client-facing email. */
function firstNameOnly(name: string): string {
  const cleaned = name.replace(/\(.*?\)/g, "").trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean)
    .filter((w) => !/^(dr|mrs|mr|ms|miss|prof)\.?$/i.test(w));
  return tokens[0] || cleaned || name;
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

/** Title + first name, ignoring surname/parentheticals (e.g. "Dr. Joan Latty" → "Dr. Joan", "Nick O'Connor" → "Nick"). */
function greetingName(name: string): string {
  const cleaned = name.replace(/\(.*?\)/g, "").trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const isTitle = (w: string) => /^(dr|mrs|mr|ms|miss|prof)\.?$/i.test(w);
  let title = "";
  let rest = tokens;
  if (tokens[0] && isTitle(tokens[0])) {
    title = tokens[0];
    rest = tokens.slice(1);
  }
  const first = rest[0] || cleaned || name;
  return title ? `${title} ${first}` : first;
}

/** Build the subject/text/html for the notification (exported so it can be previewed). */
export function buildNotification(args: NotifyArgs): { subject: string; text: string; html: string; link: string } {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const link = `${appUrl}/submissions/${args.token}`;
  const when = new Date(args.submittedAt).toLocaleString("en-US");
  const formName = args.formLabel || "client intake form";
  const greetName = greetingName(args.clinicianName);
  const subject = `New client intake form submitted${args.formLabel ? ` (${args.formLabel})` : ""}`;

  const text = [
    `Hello ${greetName},`,
    ``,
    `A new intake form has been submitted for you.`,
    ``,
    `  Form:       ${formName}`,
    `  Submitted:  ${when}`,
    ``,
    `For your client's privacy, none of their answers are included in this email.`,
    `View the submission securely in your dashboard:`,
    link,
    ``,
    `— ${PRACTICE_NAME}`,
  ].join("\n");

  const html = `
  <div style="margin:0;padding:28px 12px;background:${BRAND_CREAM};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${BRAND_CHARCOAL}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;margin:0 auto;background:#ffffff;border:1px solid ${BRAND_LINE};border-radius:16px;overflow:hidden">
      <tr><td style="height:5px;background:${BRAND_BLUE};font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td style="padding:30px 36px 0;text-align:center">
        <img src="${appUrl}/tifec-logo.png" alt="${PRACTICE_NAME}" style="height:64px;width:auto" />
      </td></tr>
      <tr><td style="padding:24px 36px 0;text-align:center">
        <h1 style="font-size:21px;font-weight:700;margin:0;color:${BRAND_CHARCOAL}">New client intake form</h1>
      </td></tr>
      <tr><td style="padding:20px 36px 0">
        <p style="font-size:16px;line-height:1.7;margin:0">Hello ${greetName},</p>
        <p style="font-size:16px;line-height:1.7;margin:10px 0 0">A new intake form has been submitted for you. Here are the details:</p>
      </td></tr>
      <tr><td style="padding:20px 36px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8fc;border:1px solid #e2ebf5;border-radius:12px">
          <tr>
            <td style="padding:15px 20px;font-size:13px;color:${BRAND_MUTED}">Form</td>
            <td style="padding:15px 20px;font-size:15px;font-weight:600;text-align:right">${formName}</td>
          </tr>
          <tr><td colspan="2" style="border-top:1px solid #e2ebf5;font-size:0;line-height:0">&nbsp;</td></tr>
          <tr>
            <td style="padding:15px 20px;font-size:13px;color:${BRAND_MUTED}">Submitted</td>
            <td style="padding:15px 20px;font-size:15px;font-weight:600;text-align:right">${when}</td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:28px 36px 0;text-align:center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto"><tr>
          <td style="border-radius:10px;background:${BRAND_BLUE}">
            <a href="${link}" style="display:inline-block;padding:15px 36px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">View submission securely &rarr;</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:20px 36px 0;text-align:center">
        <p style="font-size:14px;line-height:1.6;color:${BRAND_MUTED};margin:0">For your client's privacy, none of their answers are included in this email.</p>
      </td></tr>
      <tr><td style="padding:16px 36px 28px;text-align:center">
        <p style="font-size:12px;color:#9a978f;margin:0 0 5px">Button not working? Paste this link into your browser:</p>
        <p style="font-size:12px;margin:0;word-break:break-all"><a href="${link}" style="color:${BRAND_BLUE}">${link}</a></p>
      </td></tr>
      <tr><td style="padding:18px 36px;border-top:1px solid ${BRAND_LINE};background:#faf8f3;text-align:center">
        <p style="font-size:13px;color:${BRAND_MUTED};margin:0 0 3px"><strong>${PRACTICE_NAME}</strong></p>
        <p style="font-size:11px;color:#9a978f;margin:0;line-height:1.5">Confidential clinical notification. If you received this in error, please delete it.</p>
      </td></tr>
    </table>
  </div>`;

  return { subject, text, html, link };
}

export async function sendNotification(args: NotifyArgs): Promise<{ sent: boolean; reason?: string }> {
  const { subject, text, html, link } = buildNotification(args);

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

/** Email a clinician's issue report to the support inbox (SUPPORT_EMAIL, default admin@). */
export async function sendFeedback(args: {
  fromName: string;
  fromId: string;
  category: string;
  message: string;
}): Promise<{ sent: boolean }> {
  const to = process.env.SUPPORT_EMAIL || "admin@caymanessentialcare.com";
  const when = new Date().toLocaleString("en-US");
  const subject = `TIFEC issue report - ${args.category}`;
  const text = [
    `Issue report from ${args.fromName} (${args.fromId})`,
    `Category: ${args.category}`,
    `When: ${when}`,
    ``,
    args.message,
  ].join("\n");
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${BRAND_CHARCOAL};max-width:560px">
    <p style="font-size:15px;margin:0 0 6px"><strong>New issue report</strong> from ${args.fromName}</p>
    <p style="font-size:13px;color:${BRAND_MUTED};margin:0 0 14px">${args.category} · ${when} · ${args.fromId}</p>
    <div style="font-size:15px;line-height:1.6;white-space:pre-wrap;background:#f5f8fc;border:1px solid #e2ebf5;border-radius:10px;padding:14px 16px">${args.message
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</div>
  </div>`;

  if (!process.env.SMTP_HOST) {
    console.log("[email:dev] feedback (SMTP off):\n" + text);
    return { sent: false };
  }
  await transport().sendMail({
    from: { name: FROM_NAME, address: process.env.SMTP_FROM || process.env.SMTP_USER || "" },
    to,
    subject,
    text,
    html,
  });
  return { sent: true };
}

// =============================================================================
// Team emails: a notice went up, a ticket was raised for you, yours was
// resolved. Same rule as the intake notification above — these leave the app
// and land in inboxes and on phones, so they carry NO ticket subject and no
// message text. Those fields are encrypted precisely because they can name a
// client. A notice TITLE is included, because a notice is a broadcast to the
// whole practice by definition and "someone posted a notice" is useless.
// =============================================================================

export type TeamEmailKind = "notice" | "ticket_new" | "ticket_resolved" | "ticket_reply";

export interface TeamEmailArgs {
  to: string;
  recipientName: string;
  kind: TeamEmailKind;
  actorName: string;      // who did it
  ticketRef?: number;
  ticketArea?: string;
  noticeTitle?: string;
  path: string;           // e.g. /team/tickets/abc
}

/** Subject + bodies for a team email (exported so it can be previewed/tested). */
export function buildTeamEmail(args: TeamEmailArgs): { subject: string; text: string; html: string; link: string } {
  const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  const link = `${appUrl}${args.path}`;
  // Warmer than the client-facing intake mail: this is a colleague writing to a
  // colleague, so first name only.
  const hi = firstNameOnly(args.recipientName);

  // Each kind gets its own colour and mark, so the inbox tells them apart at a
  // glance: teal for news, amber for something waiting on you, green for done.
  const look = {
    notice:          { accent: "#2F8E93", tint: "#E4F0EF", mark: "📣", band: "linear-gradient(90deg,#2E3192,#2F8E93)" },
    ticket_new:      { accent: "#BE8127", tint: "#F8EEDC", mark: "🎫", band: "linear-gradient(90deg,#BE8127,#D9A441)" },
    ticket_resolved: { accent: "#2c7a55", tint: "#DFF0E5", mark: "✅", band: "linear-gradient(90deg,#2c7a55,#43a9ae)" },
    ticket_reply:    { accent: "#2E3192", tint: "#E6E7F4", mark: "💬", band: "linear-gradient(90deg,#2E3192,#2F8E93)" },
  }[args.kind];

  let subject: string, eyebrow: string, headline: string, line: string, cta: string;
  switch (args.kind) {
    case "notice":
      subject = `📣 ${args.noticeTitle ?? "A new notice"}`;
      eyebrow = "Notice board";
      headline = args.noticeTitle ?? "A new notice";
      line = `${args.actorName} just posted this for everyone at the practice.`;
      cta = "Read the notice";
      break;
    case "ticket_new":
      subject = `Ticket #${args.ticketRef} is yours — ${args.ticketArea ?? "new"}`;
      eyebrow = `Ticket #${args.ticketRef}`;
      headline = "Something needs you";
      line = `${args.actorName} raised a ticket for you${args.ticketArea ? ` under ${args.ticketArea}` : ""}. The details are waiting in the app.`;
      cta = "Open the ticket";
      break;
    case "ticket_reply":
      subject = `💬 New comment on ticket #${args.ticketRef}`;
      eyebrow = `Ticket #${args.ticketRef}`;
      headline = "New comment";
      line = `${args.actorName} added a comment on ticket #${args.ticketRef}. Open it in the app to read and reply.`;
      cta = "Read the comment";
      break;
    default:
      subject = `✅ Ticket #${args.ticketRef} sorted`;
      eyebrow = `Ticket #${args.ticketRef}`;
      headline = "That's sorted";
      line = `${args.actorName} marked your ticket resolved.`;
      cta = "See what changed";
  }

  const text = `Hi ${hi},\n\n${line}\n\n${cta}: ${link}\n\n— ${PRACTICE_NAME}`;

  const html = `
  <div style="margin:0;padding:28px 12px;background:${BRAND_CREAM};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${BRAND_CHARCOAL}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;margin:0 auto;background:#ffffff;border:1px solid ${BRAND_LINE};border-radius:16px;overflow:hidden">
      <tr><td style="height:6px;background:${look.accent};background-image:${look.band};font-size:0;line-height:0">&nbsp;</td></tr>

      <tr><td style="padding:26px 36px 0;text-align:center">
        <img src="${appUrl}/tifec-logo.png" alt="${PRACTICE_NAME}" style="height:52px;width:auto" />
      </td></tr>

      <tr><td style="padding:22px 36px 0;text-align:center">
        <div style="display:inline-block;width:56px;height:56px;line-height:56px;border-radius:50%;background:${look.tint};font-size:26px">${look.mark}</div>
        <div style="margin-top:14px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:${look.accent}">${escapeHtml(eyebrow)}</div>
        <h1 style="font-size:23px;line-height:1.3;font-weight:700;margin:8px 0 0;color:${BRAND_CHARCOAL}">${escapeHtml(headline)}</h1>
      </td></tr>

      <tr><td style="padding:16px 36px 0;text-align:center">
        <p style="font-size:15px;line-height:1.65;margin:0;color:${BRAND_MUTED}">Hi ${escapeHtml(hi)} — ${escapeHtml(line)}</p>
      </td></tr>

      <tr><td style="padding:24px 36px 4px;text-align:center">
        <a href="${link}" style="display:inline-block;background:${look.accent};color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:10px;font-size:15px;font-weight:700">${cta} →</a>
      </td></tr>

      <tr><td style="padding:22px 36px 26px">
        <div style="border-top:1px solid ${BRAND_LINE};padding-top:14px;text-align:center">
          <p style="font-size:12px;line-height:1.6;margin:0;color:${BRAND_MUTED}">
            You're getting this because you work at ${PRACTICE_NAME}.<br />
            Client details are never included in these emails — sign in to see them.
          </p>
        </div>
      </td></tr>
    </table>
  </div>`;

  return { subject, text, html, link };
}

/** Send a team email. Never throws: a failed email must not fail the action. */
export async function sendTeamEmail(args: TeamEmailArgs): Promise<{ sent: boolean; reason?: string }> {
  try {
    const { subject, text, html, link } = buildTeamEmail(args);
    if (!process.env.SMTP_HOST) {
      console.log(`[email:dev] would email ${args.to} — "${subject}" → ${link}`);
      return { sent: false, reason: "SMTP not configured (dev mode)" };
    }
    await transport().sendMail({
      from: { name: FROM_NAME, address: process.env.SMTP_FROM || process.env.SMTP_USER || "" },
      to: args.to, subject, text, html,
    });
    return { sent: true };
  } catch (err) {
    console.error("Team email failed:", err);
    return { sent: false, reason: "send failed" };
  }
}

/** Generic client-facing email (used by the scheduler for confirmations,
 *  reminders, reschedule/cancel notices). Dev-safe: logs instead of sending when
 *  SMTP isn't configured, so nothing goes out in local dev. */
export async function sendClientEmail(to: string, subject: string, text: string): Promise<{ sent: boolean; reason?: string }> {
  try {
    if (!process.env.SMTP_HOST) {
      console.log(`[email:dev] would email ${to} — "${subject}"`);
      return { sent: false, reason: "SMTP not configured (dev mode)" };
    }
    await transport().sendMail({
      from: { name: FROM_NAME, address: process.env.SMTP_FROM || process.env.SMTP_USER || "" },
      to, subject, text,
    });
    return { sent: true };
  } catch (err) {
    console.error("Client email failed:", err);
    return { sent: false, reason: "send failed" };
  }
}

// ---- Client-facing invoice email -------------------------------------------

const invMoney = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface InvoiceEmailArgs {
  to: string;                 // client's email
  clientName: string;         // full name, for the greeting
  practiceName: string;       // e.g. "TIFEC · Essential Care"
  invoiceNo: string;
  amountDue: number;
  message: string;            // the body the sender reviewed (plain text, may have line breaks)
  replyToName?: string;       // fallback: the sender, if no clinician is resolved
  replyToEmail?: string;
  /** The clinician who saw the client — replies go here, and their email shows in
   *  the footer as the contact (not the billing address). */
  clinician?: { name?: string; email?: string };
  /** Practice contact details for the footer (from the Setup provider config). */
  practice?: { addressLines?: string[]; phone?: string; email?: string; website?: string };
  /** Content-ID of the logo, set by the sender when it's embedded inline. */
  logoCid?: string;
}

// Brand palette — the same indigo / teal / gold as the app's header stripe.
const INV_INDIGO = "#2E3192", INV_TEAL = "#2F8E93", INV_GOLD = "#BE8127";

// The logo is embedded INLINE (as a CID attachment), not hotlinked, so it renders
// in the email body in every client with no dependency on a live URL or on the
// recipient allowing remote images. Read once and cache.
let cachedInvoiceLogo: Buffer | null | undefined;
export function invoiceEmailLogo(): Buffer | null {
  if (cachedInvoiceLogo !== undefined) return cachedInvoiceLogo;
  try { cachedInvoiceLogo = fs.readFileSync(path.join(process.cwd(), "public", "tifec-logo.png")); }
  catch { cachedInvoiceLogo = null; }
  return cachedInvoiceLogo;
}
export const INVOICE_LOGO_CID = "tifec-invoice-logo";

/** The default message shown in the preview before sending — the sender can edit
 *  it. Kept as a helper so the preview and the actual send start from one text. */
export function defaultInvoiceMessage(clientFirstName: string, practiceName: string, amountDue: number, invoiceNo: string): string {
  const hi = clientFirstName ? `Hi ${clientFirstName},` : "Hello,";
  return [
    hi,
    "",
    "Thank you so much for coming in to see us. We really appreciate you trusting us with your care.",
    "",
    `Your invoice is attached (no. ${invoiceNo}) for ${invMoney(amountDue)}. We kindly ask that it's settled before your next visit. If that's tricky right now, that's completely okay; just let your clinician know and they'll be glad to work out a payment plan with you.`,
    "",
    "Have any questions? Just hit reply and we'll be right here to help.",
    "",
    "Warmly,",
    practiceName,
  ].join("\n");
}

/** Subject + text + HTML for the invoice email (exported so it can be previewed). */
export function buildInvoiceEmail(args: InvoiceEmailArgs): { subject: string; text: string; html: string } {
  const subject = `Your invoice from ${args.practiceName}`;
  const text = args.message;
  const bodyHtml = escapeHtml(args.message).replace(/\n/g, "<br>");

  // The logo is embedded inline via its Content-ID (see sendInvoiceEmail), so it
  // renders in the body of every client. Falls back to the practice name as text
  // only when no logo is embedded (e.g. the preview, which shows text anyway).
  const header = args.logoCid
    ? `<img src="cid:${args.logoCid}" alt="${escapeHtml(args.practiceName)}" height="46" style="height:46px;width:auto;display:block;margin:0 auto;" />`
    : `<div style="font-size:20px;font-weight:700;color:${INV_INDIGO};">${escapeHtml(args.practiceName)}</div>`;

  const addressLine = (args.practice?.addressLines ?? []).map(escapeHtml).join(", ");
  const clinicianEmail = args.clinician?.email;
  // Contact row: phone + website. The billing email is only shown as a fallback
  // when there's no clinician email to point the client at.
  const contactLine = [args.practice?.phone, clinicianEmail ? undefined : args.practice?.email, args.practice?.website]
    .filter(Boolean).map((s) => escapeHtml(String(s))).join("&nbsp;&nbsp;&middot;&nbsp;&nbsp;");
  const clinicianLine = clinicianEmail
    ? `<div style="font-size:12px;color:${BRAND_MUTED};line-height:1.7;margin-top:6px;">Questions? Contact ${escapeHtml(args.clinician?.name ?? "your clinician")} at <a href="mailto:${escapeHtml(clinicianEmail)}" style="color:${INV_INDIGO};text-decoration:none;font-weight:600;">${escapeHtml(clinicianEmail)}</a></div>`
    : "";

  // Table-based, inline-styled layout for mail-client compatibility. The stripe
  // and amount carry the brand; the gradient degrades to solid indigo in Outlook.
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND_CREAM};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_CREAM};padding:30px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border:1px solid ${BRAND_LINE};border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND_CHARCOAL};">
        <tr><td style="height:5px;background:${INV_INDIGO};background:linear-gradient(90deg,${INV_INDIGO},${INV_TEAL},${INV_GOLD});font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td align="center" style="padding:32px 40px 0;">${header}</td></tr>
        <tr><td align="center" style="padding:22px 40px 0;">
          <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${BRAND_MUTED};">Invoice ${escapeHtml(args.invoiceNo)}</div>
          <div style="font-size:34px;font-weight:700;color:${INV_INDIGO};margin:7px 0 3px;">${invMoney(args.amountDue)}</div>
          <div style="font-size:12.5px;color:${BRAND_MUTED};">due before your next visit</div>
        </td></tr>
        <tr><td style="padding:22px 40px 0;"><div style="border-top:1px solid ${BRAND_LINE};font-size:0;line-height:0;">&nbsp;</div></td></tr>
        <tr><td style="padding:22px 40px 26px;font-size:15px;line-height:1.7;color:${BRAND_CHARCOAL};">${bodyHtml}</td></tr>
        <tr><td align="center" style="padding:22px 40px 26px;background:#faf8f3;border-top:1px solid ${BRAND_LINE};">
          <div style="font-size:13.5px;font-weight:700;color:${BRAND_CHARCOAL};margin-bottom:5px;">${escapeHtml(args.practiceName)}</div>
          ${addressLine ? `<div style="font-size:12px;color:${BRAND_MUTED};line-height:1.6;">${addressLine}</div>` : ""}
          ${contactLine ? `<div style="font-size:12px;color:${BRAND_MUTED};line-height:1.6;">${contactLine}</div>` : ""}
          ${clinicianLine}
          <div style="font-size:10.5px;color:#a7a49c;line-height:1.5;margin-top:9px;">This email and its attachment are confidential and intended only for the named client.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}

/** Send an invoice PDF to a client. `pdf` is the raw bytes; it's attached as
 *  Invoice-<no>.pdf. Replies go to the clinician/biller who sent it. */
export async function sendInvoiceEmail(args: InvoiceEmailArgs & { pdf: Uint8Array }): Promise<{ sent: boolean; reason?: string }> {
  try {
    // Embed the logo inline (Content-Disposition: inline) so it renders in the
    // email body, not as a downloadable attachment.
    const logo = invoiceEmailLogo();
    const logoCid = logo ? INVOICE_LOGO_CID : undefined;
    const { subject, text, html } = buildInvoiceEmail({ ...args, logoCid });
    if (!process.env.SMTP_HOST) {
      console.log(`[email:dev] would email invoice ${args.invoiceNo} to ${args.to} — "${subject}"`);
      return { sent: false, reason: "SMTP not configured (dev mode)" };
    }
    const attachments: nodemailer.SendMailOptions["attachments"] = [
      { filename: `Invoice-${args.invoiceNo}.pdf`, content: Buffer.from(args.pdf), contentType: "application/pdf" },
    ];
    if (logo && logoCid) {
      attachments.push({ filename: "logo.png", content: logo, cid: logoCid, contentType: "image/png", contentDisposition: "inline" });
    }
    // Replies go to the clinician who saw the client, not the billing mailbox.
    const replyEmail = args.clinician?.email || args.replyToEmail;
    const replyName = args.clinician?.email ? (args.clinician?.name || "") : (args.replyToName || "");
    await transport().sendMail({
      from: { name: args.practiceName || FROM_NAME, address: process.env.SMTP_FROM || process.env.SMTP_USER || "" },
      to: args.to,
      replyTo: replyEmail ? { name: replyName, address: replyEmail } : undefined,
      subject, text, html,
      attachments,
    });
    return { sent: true };
  } catch (err) {
    console.error("Invoice email failed:", err);
    return { sent: false, reason: "send failed" };
  }
}
