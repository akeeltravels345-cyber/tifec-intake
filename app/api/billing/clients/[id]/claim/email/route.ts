import { NextResponse } from "next/server";
import { caymanToday } from "@/lib/caymanTime";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { getClient, clinicianSeesClient, updateClient, recordSentEmail, type ClientDocument } from "@/lib/clients";
import { getClinician } from "@/lib/clinicians";
import {
  listInsurers, listSessions, getPracticeConfig, listExternalClinicians, listCptCodes,
  markSessionBilled, type BillingSession, type Insurer,
} from "@/lib/billing";
import { buildClaimForms } from "@/lib/cms1500";
import { claimPdf } from "@/lib/claimPdf";
import { saveDocFile } from "@/lib/clientDocs";
import { buildClaimEmail, defaultClaimMessage, sendClaimEmail } from "@/lib/email";
import { randomId } from "@/lib/crypto";
import { logChange } from "@/lib/db";

export const dynamic = "force-dynamic";

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Load the client, resolve which payer to claim, and build that payer's CMS-1500
// form(s) from exactly the sessions that belong to it — the same set we'll mark
// billed. Mirrors how the on-screen /cms1500 page builds forms, but scoped to one
// payer so each claim goes to one insurer.
async function load(id: string, req: Request) {
  const user = await getBillingUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };

  const client = await getClient(id);
  if (!client) return { error: NextResponse.json({ error: "Client not found." }, { status: 404 }) };

  const seesAll = isBiller(user.role) || isOwner(user.role);
  if (!seesAll && !(await clinicianSeesClient(id, user.clinician.id)))
    return { error: NextResponse.json({ error: "Not allowed." }, { status: 403 }) };

  const [insurers, cptCodes, cfg, external, loadedSessions] = await Promise.all([
    listInsurers(), listCptCodes(), getPracticeConfig(), listExternalClinicians(),
    seesAll ? listSessions({ clientId: id }) : listSessions({ clientId: id, clinicianId: user.clinician.id }),
  ]);

  const url = new URL(req.url);
  // Optional session scope (from the batch page, where the biller selected specific
  // visits). When present, the claim covers exactly those sessions; otherwise it
  // covers all of the payer's insured visits (the per-client page's behaviour).
  const wantedIds = (url.searchParams.get("sessions") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const allSessions = wantedIds.length ? loadedSessions.filter((s) => wantedIds.includes(s.id)) : loadedSessions;

  // Payers this client can be claimed to = distinct insurers on their sessions that
  // bill by CMS-1500 (not invoice-style payers).
  const claimPayers = [...new Set(
    allSessions.filter((s) => s.insurerId && insurers.find((i) => i.id === s.insurerId)?.billStyle !== "invoice").map((s) => s.insurerId as string),
  )].map((pid) => insurers.find((i) => i.id === pid)).filter(Boolean) as Insurer[];

  const requested = url.searchParams.get("payer");
  const payer = (requested ? claimPayers.find((p) => p.id === requested) : undefined) ?? (claimPayers.length === 1 ? claimPayers[0] : undefined);

  // Sessions that make up this payer's claim (all insured visits for the payer —
  // the exact set the on-screen form shows).
  const payerSessions: BillingSession[] = payer ? allSessions.filter((s) => s.insurerId === payer.id) : [];

  const prov = cfg.provider ?? {};
  const forms = payer
    ? buildClaimForms(client, payerSessions, {
        insName: (idv) => insurers.find((i) => i.id === idv)?.name ?? "",
        clinName: (cid) => getClinician(cid)?.name ?? external.find((c) => c.id === cid)?.name ?? cid,
        renderingNpi: (cid) => prov.renderingNpi?.[cid] ?? "",
        cptFee: (code) => cptCodes.find((c) => c.code === code)?.fee ?? 0,
        carrierCode: (insurerId) => insurers.find((i) => i.id === insurerId)?.claimCode ?? "",
        billStyle: (insurerId) => (insurers.find((i) => i.id === insurerId)?.billStyle === "invoice" ? "invoice" : "claim"),
      })
    : [];

  return {
    user, client, prov, payer, forms, payerSessions,
    claimPayers: claimPayers.map((p) => ({ id: p.id, name: p.name, email: p.email ?? "" })),
    practiceName: prov.practiceName || "the practice",
  };
}

// Preview: who the claim goes to, the payer options, and the default cover note.
// No PDF is generated and nothing is marked billed here.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await load(id, req);
  if ("error" in r) return r.error;
  const { user, client, prov, payer, forms, claimPayers, practiceName } = r;
  const replyToEmail = prov.claimsReplyToEmail || user.clinician.email || "";
  const replyToName = (prov.claimsReplyToEmail ? prov.claimsReplyToName : user.clinician.name) || "";

  if (!payer) {
    return NextResponse.json({
      ok: true, ready: false,
      reason: claimPayers.length === 0 ? "This client has no CMS-1500 sessions to claim." : "Choose which payer to send this claim to.",
      payers: claimPayers,
    });
  }

  const total = forms.reduce((t, f) => t + f.total, 0);
  const lineCount = forms.reduce((t, f) => t + f.lines.length, 0);
  const patientName = `${client.last}, ${client.first}`;
  const to = payer.email ?? "";
  const message = defaultClaimMessage(payer.name, patientName, practiceName, total, forms[0]?.memberId);
  const { subject } = buildClaimEmail({ to, payerName: payer.name, patientName, practiceName, claimCount: lineCount, total, memberId: forms[0]?.memberId, message });

  return NextResponse.json({
    ok: true, ready: true,
    payer: { id: payer.id, name: payer.name, email: to },
    hasEmail: Boolean(to),
    payers: claimPayers,
    patientName, lineCount, formCount: forms.length, total,
    subject, message,
    replyTo: replyToEmail,
    replyToName,
  });
}

// Send: generate the CMS-1500 PDF, email it to the payer, store the PDF in the
// client's documents, and mark the claimed sessions billed today. All side effects
// happen only on a successful send, so "billed" always means actually submitted.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await load(id, req);
  if ("error" in r) return r.error;
  const { user, client, prov, payer, forms, payerSessions, practiceName } = r;
  // Insurer replies (denials, queries) go to the configured billing inbox, or the
  // sender when none is set.
  const replyToEmail = prov.claimsReplyToEmail || user.clinician.email || undefined;
  const replyToName = (prov.claimsReplyToEmail ? prov.claimsReplyToName : user.clinician.name) || "";

  if (!payer) return NextResponse.json({ error: "Choose which payer to send this claim to." }, { status: 400 });
  if (forms.length === 0) return NextResponse.json({ error: "There's nothing to claim for this payer." }, { status: 400 });
  const to = payer.email?.trim();
  if (!to) return NextResponse.json({ error: `${payer.name} has no claims email. Add one in Setup → Insurers first.` }, { status: 400 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body = use defaults */ }

  const total = forms.reduce((t, f) => t + f.total, 0);
  const lineCount = forms.reduce((t, f) => t + f.lines.length, 0);
  const patientName = `${client.last}, ${client.first}`;
  const message = typeof body.message === "string" && body.message.trim()
    ? body.message
    : defaultClaimMessage(payer.name, patientName, practiceName, total, forms[0]?.memberId);
  const subjectOverride = typeof body.subject === "string" && body.subject.trim() ? body.subject.trim() : undefined;

  const pdf = await claimPdf(forms, prov);
  const today = caymanToday();

  const result = await sendClaimEmail({
    to,
    payerName: payer.name,
    patientName,
    practiceName,
    claimCount: lineCount,
    total,
    memberId: forms[0]?.memberId,
    subject: subjectOverride,
    message,
    replyToName,
    replyToEmail,
    practice: {
      addressLines: [prov.addressLine1, prov.addressLine2, [prov.city, prov.region, prov.postal].filter(Boolean).join(" ")].filter(Boolean) as string[],
      phone: prov.phone, email: prov.email, website: prov.website,
    },
    pdf,
    filename: `CMS-1500-${patientName.replace(/[^\w-]+/g, "_")}-${today}.pdf`,
  });

  const { subject } = buildClaimEmail({ to, payerName: payer.name, patientName, practiceName, claimCount: lineCount, total, memberId: forms[0]?.memberId, subject: subjectOverride, message });

  // Truthful paper trail: record the send (success or failure) on the client record.
  await recordSentEmail(id, {
    kind: "claim", to, subject, payer: payer.name, amount: total,
    byId: user.clinician.id, byName: user.clinician.name,
    ok: result.sent, reason: result.sent ? undefined : result.reason,
  });

  if (!result.sent) {
    return NextResponse.json({ ok: false, error: result.reason || "Could not send the claim." }, { status: 502 });
  }

  // Store the exact PDF that went out in the client's Documents, and mark every
  // not-yet-billed session on this claim as submitted today.
  const bytes = Buffer.from(pdf);
  const docId = randomId();
  const docName = `CMS-1500 claim — ${payer.name} — ${today}`;
  await saveDocFile(docId, id, bytes.toString("base64"), "application/pdf", bytes.length, `${docName}.pdf`);
  const doc: ClientDocument = { id: docId, name: docName, kind: "claim", stored: true, mime: "application/pdf", size: bytes.length, addedAt: today };
  const documents = [...(client.profile.documents ?? []), doc];
  await updateClient(id, client.insurerId, { ...client.profile, documents });

  let billedCount = 0;
  for (const s of payerSessions) {
    if (!s.billedDate) { await markSessionBilled(s.id, true, today); billedCount++; }
  }

  await logChange(user.clinician.id, `client:${id}`, "status", `emailed a CMS-1500 claim to ${payer.name} (${money(total)}), stored it in documents, and marked ${billedCount} session${billedCount === 1 ? "" : "s"} submitted`);
  return NextResponse.json({ ok: true, sent: true, to, subject, billedCount, docName });
}
