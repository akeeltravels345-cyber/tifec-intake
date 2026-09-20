import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { listInsurers, listSessions, getPracticeConfig, listExternalClinicians, listCptCodes } from "@/lib/billing";
import { getClient, clinicianSeesClient } from "@/lib/clients";
import { getClinician } from "@/lib/clinicians";
import { buildClaimForms } from "@/lib/cms1500";
import Cms1500Form, { HCFA_CSS } from "@/components/billing/Cms1500Form";
import Cms1500OfficialForm, { OFFICIAL_CSS } from "@/components/billing/Cms1500OfficialForm";
import Cms1500Toggle from "@/components/billing/Cms1500Toggle";
import PrintButton from "@/components/billing/PrintButton";

export const dynamic = "force-dynamic";

export default async function Cms1500Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getBillingUser();
  if (!user) redirect(`/login?next=/billing/clients/${id}/cms1500`);

  const client = await getClient(id);
  if (!client) notFound();

  const seesAll = isBiller(user.role) || isOwner(user.role);
  if (!seesAll && !(await clinicianSeesClient(id, user.clinician.id))) redirect("/billing/clients");

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

  // Invoice-style payers (e.g. Ponciana Rehab) don't go on a CMS-1500 — they bill
  // by invoice. Surface a link to generate each one's invoice.
  const invoicePayers = [...new Set(
    sessions.filter((s) => s.insurerId && insurers.find((i) => i.id === s.insurerId)?.billStyle === "invoice").map((s) => s.insurerId as string),
  )].map((pid) => ({ id: pid, name: insurers.find((i) => i.id === pid)?.name ?? "Payer" }));

  // No standard CMS-1500 claims and exactly one invoice-style payer → go straight
  // to that payer's invoice, so "Generate CMS-1500" never dead-ends on a link.
  if (forms.length === 0 && invoicePayers.length === 1) redirect(`/billing/clients/${id}/invoice?type=payer&payer=${invoicePayers[0].id}`);

  return (
    <div className="hcfa-page">
      <style dangerouslySetInnerHTML={{ __html: HCFA_CSS + OFFICIAL_CSS }} />
      <div className="hcfa-bar hcfa-noprint">
        <Link href={`/billing/clients/${id}`} className="ls-back">← Back to client</Link>
        <div style={{ flex: 1 }} />
        {forms.length > 0 && <PrintButton label="Print / Save PDF" className="bl-cta hcfa-noprint" />}
      </div>

      {(!prov.npi || !prov.ein) && (
        <div className="hcfa-warn hcfa-noprint">
          Provider identifiers aren&apos;t set yet, so boxes 25, 31–33 (Tax ID, NPI, billing provider) will print blank.
          Add them in <Link href="/billing/config">Setup</Link> once you have them.
        </div>
      )}

      {invoicePayers.length > 0 && (
        <div className="hcfa-warn hcfa-noprint">
          {invoicePayers.map((py) => (
            <div key={py.id} style={{ marginBottom: 4 }}>
              <b>{py.name}</b> bills by invoice, not a CMS-1500. <Link href={`/billing/clients/${id}/invoice?type=payer&payer=${py.id}`} style={{ marginLeft: 4 }}>Generate {py.name} invoice →</Link>
            </div>
          ))}
        </div>
      )}

      {forms.length === 0 ? (
        <div className="hcfa-warn hcfa-noprint">{invoicePayers.length > 0 ? "No standard-claim insurers for this client — use the invoice link above." : "This client has no insured sessions to claim. Self-pay visits don't go on a CMS-1500."}</div>
      ) : (
        <Cms1500Toggle
          official={forms.map((f) => <Cms1500OfficialForm key={f.key} f={f} provider={prov} />)}
          sheet={forms.map((f) => <Cms1500Form key={f.key} f={f} provider={prov} />)}
        />
      )}
    </div>
  );
}
