import { NextResponse } from "next/server";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { listAllClients, updateClient, type ClientReferral } from "@/lib/clients";
import { getDocFile } from "@/lib/clientDocs";
import { listInsurers } from "@/lib/billing";
import { extractReferral } from "@/lib/referralExtract";
import { logChange } from "@/lib/db";

export const dynamic = "force-dynamic";

// One-off backfill: referrals uploaded BEFORE the filename-reading fix never had
// their expiry read into the notice bar. This re-reads the already-uploaded
// referral documents (text first, then the "ref exp DD-MMM-YY" filename) and
// populates each client's referral expiry.
//   GET  = dry run (no writes) — shows exactly what would change.
//   POST = apply the updates and log each one.
// Defaults to CINICO; pass ?insurer=<name|all>. Owner / biller / admin only.

async function pdfText(buf: Buffer): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : String(text ?? "");
  } catch { return ""; }
}

async function run(req: Request, apply: boolean) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const isAdmin = user.clinician.contact === "admin";
  if (!isBiller(user.role) && !isOwner(user.role) && !isAdmin)
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const url = new URL(req.url);
  const insurerParam = (url.searchParams.get("insurer") ?? "CINICO").trim();
  const insurers = await listInsurers();
  const all = insurerParam.toLowerCase() === "all";
  const target = all ? undefined : insurers.find((i) => i.name.toLowerCase() === insurerParam.toLowerCase() || i.id === insurerParam);
  if (!all && !target) return NextResponse.json({ error: `No insurer named "${insurerParam}". Try ?insurer=all or an exact name.` }, { status: 400 });

  const clients = (await listAllClients()).filter((c) => all ? !!c.insurerId : c.insurerId === target!.id);

  const results: { client: string; clientId: string; doc: string; currentEnd: string | null; readEnd: string | null; action: string }[] = [];
  let updated = 0, flagged = 0, noDoc = 0, unreadable = 0;

  for (const c of clients) {
    const name = `${c.first} ${c.last}`.trim() || "Unnamed";
    const docs = (c.profile.documents ?? []).filter((d) => d.kind === "referral");
    if (docs.length === 0) { noDoc++; continue; }
    // Most recently added referral document wins (a newer referral replaces older).
    const doc = [...docs].sort((a, b) => (a.addedAt || "").localeCompare(b.addedAt || "")).at(-1)!;

    // Read the stored file (scanned PDFs have no text, so this usually falls back
    // to the filename inside extractReferral).
    let text = "";
    const fileName = doc.name || "";
    if (doc.stored) {
      const file = await getDocFile(doc.id).catch(() => null);
      if (file && file.mime === "application/pdf") text = await pdfText(Buffer.from(file.base64, "base64"));
    }
    const ex = extractReferral(text, fileName);
    const currentEnd = c.profile.referral?.endDate ?? null;

    if (ex.endDate) {
      const action = currentEnd === ex.endDate ? "already set (no change)" : currentEnd ? `update ${currentEnd} -> ${ex.endDate}` : `set ${ex.endDate}`;
      results.push({ client: name, clientId: c.id, doc: fileName, currentEnd, readEnd: ex.endDate, action });
      if (currentEnd !== ex.endDate) {
        updated++;
        if (apply) {
          const referral: ClientReferral = {
            ...(c.profile.referral ?? {}),
            endDate: ex.endDate,
            startDate: ex.startDate ?? c.profile.referral?.startDate,
            months: undefined,
            derivedFrom: ex.source === "filename" ? "filename" : "document",
            needsReview: false,
            documentId: doc.id,
            documentName: fileName,
          };
          await updateClient(c.id, c.insurerId, { ...c.profile, referral });
          await logChange(user.clinician.id, `client:${c.id}`, "edit", `referral expiry backfilled from "${fileName}" -> ${ex.endDate}`);
        }
      }
    } else {
      unreadable++;
      if (!currentEnd) flagged++;
      results.push({ client: name, clientId: c.id, doc: fileName, currentEnd, readEnd: null, action: currentEnd ? "couldn't read filename — left existing date" : "couldn't read — needs manual review" });
    }
  }

  results.sort((a, b) => a.client.localeCompare(b.client));
  return NextResponse.json({
    ok: true,
    mode: apply ? "applied" : "dry-run (no changes made)",
    insurer: all ? "all" : target!.name,
    clientsMatched: clients.length,
    withReferralDoc: clients.length - noDoc,
    wouldUpdateOrUpdated: updated,
    unreadable,
    needsManualReview: flagged,
    results,
  });
}

export async function GET(req: Request) { return run(req, false); }
export async function POST(req: Request) { return run(req, true); }
