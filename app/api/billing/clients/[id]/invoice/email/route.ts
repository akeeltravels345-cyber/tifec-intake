import { NextResponse } from "next/server";
import { getBillingUser } from "@/lib/billingRole";
import { resolveClientInvoice } from "@/lib/invoiceServer";
import { recordSentEmail } from "@/lib/clients";
import { invoicePdf } from "@/lib/invoicePdf";
import { buildInvoiceEmail, defaultInvoiceMessage, sendInvoiceEmail } from "@/lib/email";
import { logChange } from "@/lib/db";

export const dynamic = "force-dynamic";

// Load the invoice the same way the on-screen page does, and report whether it
// can be emailed (client has an address on file, there's something to bill).
async function load(id: string, req: Request) {
  const user = await getBillingUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };

  const url = new URL(req.url);
  const sessionsParam = url.searchParams.get("sessions") ?? undefined;
  const isCopay = url.searchParams.get("type") === "copay";

  const res = await resolveClientInvoice(id, user, sessionsParam, isCopay);
  if (!res.ok) return { error: NextResponse.json({ error: res.error }, { status: res.status }) };
  return { user, ...res.data };
}

// Preview: what will be sent, before sending. No PDF is generated here.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await load(id, req);
  if ("error" in r) return r.error;
  const { user, client, inv, itemCount, clinician } = r;

  const to = client.profile.email ?? "";
  const message = defaultInvoiceMessage(client.first, inv.practice.name, inv.amountDue, inv.number);
  // Derive the subject from the same builder that sends, so preview and sent email match.
  const { subject } = buildInvoiceEmail({ to, clientName: "", practiceName: inv.practice.name, invoiceNo: inv.number, amountDue: inv.amountDue, message });
  // Replies go to the clinician who saw the client (falling back to the sender).
  const replyTo = clinician?.email || user.clinician.email || "";
  const replyToName = (clinician?.email ? clinician?.name : user.clinician.name) || "";
  return NextResponse.json({
    ok: true,
    to,
    hasEmail: Boolean(to),
    itemCount,
    invoiceNo: inv.number,
    amountDue: inv.amountDue,
    practiceName: inv.practice.name,
    subject,
    message,
    replyTo,
    replyToName,
  });
}

// Send: generate the PDF and email it to the client, with the reviewed message.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await load(id, req);
  if ("error" in r) return r.error;
  const { user, client, inv, itemCount, isCopay, clinician } = r;

  const to = client.profile.email?.trim();
  if (!to) return NextResponse.json({ error: "This client has no email on file. Add one on their record first." }, { status: 400 });
  if (itemCount === 0) return NextResponse.json({ error: "There's nothing to invoice." }, { status: 400 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body = use default message */ }
  const message = typeof body.message === "string" && body.message.trim()
    ? body.message
    : defaultInvoiceMessage(client.first, inv.practice.name, inv.amountDue, inv.number);
  const subjectOverride = typeof body.subject === "string" && body.subject.trim() ? body.subject.trim() : undefined;

  const printedAt = new Date().toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const pdf = await invoicePdf(inv, printedAt);

  const result = await sendInvoiceEmail({
    to,
    clientName: `${client.first} ${client.last}`,
    practiceName: inv.practice.name,
    invoiceNo: inv.number,
    amountDue: inv.amountDue,
    subject: subjectOverride,
    message,
    replyToName: user.clinician.name,
    replyToEmail: user.clinician.email || undefined,
    clinician,
    practice: {
      addressLines: inv.practice.addressLines,
      phone: inv.practice.phone,
      email: inv.practice.email,
      website: inv.practice.website,
    },
    pdf,
  });

  const { subject } = buildInvoiceEmail({ to, clientName: "", practiceName: inv.practice.name, invoiceNo: inv.number, amountDue: inv.amountDue, subject: subjectOverride, message });

  // Record the send on the client record — both successes and failures — so the
  // history is a truthful paper trail of what actually went out.
  await recordSentEmail(id, {
    kind: "invoice", to, subject, invoiceNo: inv.number, amount: inv.amountDue,
    byId: user.clinician.id, byName: user.clinician.name,
    ok: result.sent, reason: result.sent ? undefined : result.reason,
  });

  if (!result.sent) {
    return NextResponse.json({ ok: false, error: result.reason || "Could not send the email." }, { status: 502 });
  }

  await logChange(user.clinician.id, `client:${id}`, "status", `emailed invoice ${inv.number} (${isCopay ? "co-pay" : "self-pay"}) to the client`);
  return NextResponse.json({ ok: true, sent: true, to, subject });
}
