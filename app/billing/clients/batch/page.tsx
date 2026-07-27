import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { listInsurers, listSessions, getPracticeConfig, listExternalClinicians } from "@/lib/billing";
import { getClient, clinicianSeesClient } from "@/lib/clients";
import { getClinician } from "@/lib/clinicians";
import { buildClaimForms } from "@/lib/cms1500";
import Cms1500Form, { HCFA_CSS } from "@/components/billing/Cms1500Form";
import PrintButton from "@/components/billing/PrintButton";

export const dynamic = "force-dynamic";

export default async function BatchCms1500Page({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids: idsParam } = await searchParams;
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/clients");

  const ids = (idsParam ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
  if (ids.length === 0) redirect("/billing/clients");

  const seesAll = isBiller(user.role) || isOwner(user.role);
  const [insurers, cfg, external, allSessions] = await Promise.all([
    listInsurers(), getPracticeConfig(), listExternalClinicians(),
    // Load once, then group per client in memory (avoids a query per client).
    seesAll ? listSessions() : listSessions({ clinicianId: user.clinician.id }),
  ]);
  const prov = cfg.provider ?? {};
  const resolvers = {
    insName: (idv: string | null) => insurers.find((i) => i.id === idv)?.name ?? "",
    clinName: (cid: string) => getClinician(cid)?.name ?? external.find((c) => c.id === cid)?.name ?? cid,
    renderingNpi: (cid: string) => prov.renderingNpi?.[cid] ?? "",
  };

  const sessionsByClient = new Map<string, typeof allSessions>();
  for (const s of allSessions) {
    if (!s.clientId) continue;
    (sessionsByClient.get(s.clientId) ?? sessionsByClient.set(s.clientId, []).get(s.clientId)!)!.push(s);
  }

  // Resolve each requested client, honouring isolation, then build their forms.
  const blocks: { name: string; forms: ReturnType<typeof buildClaimForms> }[] = [];
  let skipped = 0, noClaims = 0;
  for (const id of ids) {
    const client = await getClient(id);
    if (!client) { skipped++; continue; }
    if (!seesAll && !(await clinicianSeesClient(id, user.clinician.id))) { skipped++; continue; }
    const forms = buildClaimForms(client, sessionsByClient.get(id) ?? [], resolvers);
    if (forms.length === 0) { noClaims++; continue; }
    blocks.push({ name: `${client.first} ${client.last}`, forms });
  }

  const totalForms = blocks.reduce((t, b) => t + b.forms.length, 0);

  return (
    <div className="hcfa-page">
      <style dangerouslySetInnerHTML={{ __html: HCFA_CSS }} />
      <div className="hcfa-bar hcfa-noprint">
        <Link href="/billing/clients" className="ls-back">← All clients</Link>
        <div style={{ flex: 1 }} />
        {totalForms > 0 && <PrintButton label={`Print ${totalForms} claim${totalForms === 1 ? "" : "s"} / Save PDF`} className="bl-cta hcfa-noprint" />}
      </div>

      {(!prov.npi || !prov.ein) && (
        <div className="hcfa-warn hcfa-noprint">
          Provider identifiers aren&apos;t set yet, so boxes 25, 31–33 will print blank. Add them in <Link href="/billing/config">Setup</Link>.
        </div>
      )}
      {(skipped > 0 || noClaims > 0) && (
        <div className="hcfa-warn hcfa-noprint">
          {blocks.length} client{blocks.length === 1 ? "" : "s"} with claims.
          {noClaims > 0 && ` ${noClaims} had no insured sessions to claim.`}
          {skipped > 0 && ` ${skipped} couldn't be included.`}
        </div>
      )}

      {blocks.length === 0 ? (
        <div className="hcfa-warn hcfa-noprint">Nothing to claim for the selected clients.</div>
      ) : blocks.map((b) => (
        <div key={b.name}>
          <div className="hcfa-clientlab">{b.name}</div>
          {b.forms.map((f) => <Cms1500Form key={f.key} f={f} provider={prov} />)}
        </div>
      ))}
    </div>
  );
}
