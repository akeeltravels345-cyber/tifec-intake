import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { listInsurers, listSessions, getPracticeConfig, listExternalClinicians, listCptCodes } from "@/lib/billing";
import { getClient, clinicianSeesClient } from "@/lib/clients";
import { getClinician } from "@/lib/clinicians";
import { buildClaimForms, type ClaimForm } from "@/lib/cms1500";
import { cms1500Pdf } from "@/lib/cms1500Pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pixel-exact CMS-1500 (08-05) PDF for a batch of claims (from ?ids= or
// ?sessions=), one page per form, sorted by client — mirrors the batch page.
export async function GET(req: Request) {
  const user = await getBillingUser();
  if (!user) return new Response("Not signed in.", { status: 401 });

  const url = new URL(req.url);
  const clientIds = (url.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
  const sessionIds = (url.searchParams.get("sessions") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 800);
  if (clientIds.length === 0 && sessionIds.length === 0) return new Response("Nothing to claim.", { status: 400 });

  const seesAll = isBiller(user.role) || isOwner(user.role);
  const [insurers, cptCodes, cfg, external, allSessions] = await Promise.all([
    listInsurers(), listCptCodes(), getPracticeConfig(), listExternalClinicians(),
    seesAll ? listSessions() : listSessions({ clinicianId: user.clinician.id }),
  ]);
  const prov = cfg.provider ?? {};
  const resolvers = {
    insName: (idv: string | null) => insurers.find((i) => i.id === idv)?.name ?? "",
    clinName: (cid: string) => getClinician(cid)?.name ?? external.find((c) => c.id === cid)?.name ?? cid,
    renderingNpi: (cid: string) => prov.renderingNpi?.[cid] ?? "",
    cptFee: (code: string) => cptCodes.find((c) => c.code === code)?.fee ?? 0,
    carrierCode: (insurerId: string) => insurers.find((i) => i.id === insurerId)?.claimCode ?? "",
    billStyle: (insurerId: string) => (insurers.find((i) => i.id === insurerId)?.billStyle === "invoice" ? "invoice" : "claim") as "claim" | "invoice",
  };

  const byClient = new Map<string, typeof allSessions>();
  const order: string[] = [];
  const bucket = (cid: string) => { let b = byClient.get(cid); if (!b) { b = []; byClient.set(cid, b); order.push(cid); } return b; };
  if (sessionIds.length > 0) {
    const wanted = new Set(sessionIds);
    for (const s of allSessions) { if (!wanted.has(s.id) || !s.clientId || !s.insurerId) continue; bucket(s.clientId).push(s); }
  } else {
    const idSet = new Set(clientIds);
    for (const id of clientIds) { if (seesAll || (await clinicianSeesClient(id, user.clinician.id))) bucket(id); }
    for (const s of allSessions) { if (s.clientId && idSet.has(s.clientId) && s.insurerId && byClient.has(s.clientId)) byClient.get(s.clientId)!.push(s); }
  }

  const blocks: { name: string; forms: ClaimForm[] }[] = [];
  for (const cid of order) {
    const client = await getClient(cid);
    if (!client) continue;
    const forms = buildClaimForms(client, byClient.get(cid) ?? [], resolvers);
    if (forms.length > 0) blocks.push({ name: `${client.first} ${client.last}`, forms });
  }
  blocks.sort((a, b) => a.name.localeCompare(b.name));
  const forms = blocks.flatMap((b) => b.forms);
  if (forms.length === 0) return new Response("No insured sessions to claim.", { status: 404 });

  const pdf = await cms1500Pdf(forms, prov);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="CMS1500-batch-${forms.length}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
