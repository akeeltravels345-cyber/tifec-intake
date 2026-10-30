import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { listInsurers, listSessions, getPracticeConfig, listExternalClinicians, listCptCodes } from "@/lib/billing";
import { getClient, clinicianSeesClient } from "@/lib/clients";
import { getClinician } from "@/lib/clinicians";
import { buildClaimForms } from "@/lib/cms1500";
import { cms1500Pdf } from "@/lib/cms1500Pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pixel-exact CMS-1500 (08-05) claim PDF for one client — a literal duplicate of
// Practice Perfect's output, built from the same blank-form image and coordinates.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getBillingUser();
  if (!user) return new Response("Not signed in.", { status: 401 });

  const client = await getClient(id);
  if (!client) return new Response("Client not found.", { status: 404 });

  const seesAll = isBiller(user.role) || isOwner(user.role);
  if (!seesAll && !(await clinicianSeesClient(id, user.clinician.id))) return new Response("Not allowed.", { status: 403 });

  const [insurers, cptCodes, cfg, external, sessions] = await Promise.all([
    listInsurers(), listCptCodes(), getPracticeConfig(), listExternalClinicians(),
    seesAll ? listSessions({ clientId: id }) : listSessions({ clientId: id, clinicianId: user.clinician.id }),
  ]);
  const prov = cfg.provider ?? {};
  const forms = buildClaimForms(client, sessions, {
    insName: (idv) => insurers.find((i) => i.id === idv)?.name ?? "",
    clinName: (cid) => getClinician(cid)?.name ?? external.find((c) => c.id === cid)?.name ?? cid,
    renderingNpi: (cid) => prov.renderingNpi?.[cid] ?? "",
    cptFee: (code) => cptCodes.find((c) => c.code === code)?.fee ?? 0,
    carrierCode: (insurerId) => insurers.find((i) => i.id === insurerId)?.claimCode ?? "",
    billStyle: (insurerId) => (insurers.find((i) => i.id === insurerId)?.billStyle === "invoice" ? "invoice" : "claim"),
  });

  if (forms.length === 0) return new Response("No insured sessions to claim.", { status: 404 });

  const pdf = await cms1500Pdf(forms, prov);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="CMS1500-${client.last}-${client.first}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
