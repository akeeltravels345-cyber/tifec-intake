import Link from "next/link";
import { redirect } from "next/navigation";
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

export default async function BatchCms1500Page({ searchParams }: { searchParams: Promise<{ ids?: string; sessions?: string }> }) {
  const { ids: idsParam, sessions: sessionsParam } = await searchParams;
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/clients");

  const clientIds = (idsParam ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
  const sessionIds = (sessionsParam ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 800);
  if (clientIds.length === 0 && sessionIds.length === 0) redirect("/billing/clients");

  const seesAll = isBiller(user.role) || isOwner(user.role);
  const [insurers, cptCodes, cfg, external, allSessions] = await Promise.all([
    listInsurers(), listCptCodes(), getPracticeConfig(), listExternalClinicians(),
    // Load once (scoped to the clinician for isolation), then group in memory.
    seesAll ? listSessions() : listSessions({ clinicianId: user.clinician.id }),
  ]);
  const prov = cfg.provider ?? {};
  const resolvers = {
    insName: (idv: string | null) => insurers.find((i) => i.id === idv)?.name ?? "",
    clinName: (cid: string) => getClinician(cid)?.name ?? external.find((c) => c.id === cid)?.name ?? cid,
    renderingNpi: (cid: string) => prov.renderingNpi?.[cid] ?? "",
    cptFee: (code: string) => cptCodes.find((c) => c.code === code)?.fee ?? 0,
    carrierCode: (insurerId: string) => insurers.find((i) => i.id === insurerId)?.claimCode ?? "",
  };

  // Two ways in:
  //   sessions=…  → claim only those specific sessions (from a queue selection)
  //   ids=…       → claim ALL of each client's billable sessions (from the roster)
  // Either way we build a per-client bucket of the sessions to claim.
  const sessionsByClient = new Map<string, typeof allSessions>();
  const order: string[] = [];
  const bucket = (cid: string) => {
    let b = sessionsByClient.get(cid);
    if (!b) { b = []; sessionsByClient.set(cid, b); order.push(cid); }
    return b;
  };

  let skipped = 0, noClaims = 0;
  if (sessionIds.length > 0) {
    const wanted = new Set(sessionIds);
    // allSessions is already access-scoped, so a session not in it is simply skipped.
    for (const s of allSessions) {
      if (!wanted.has(s.id) || !s.clientId || !s.insurerId) continue;
      bucket(s.clientId).push(s);
    }
  } else {
    const idSet = new Set(clientIds);
    for (const id of clientIds) {
      const ok = seesAll || (await clinicianSeesClient(id, user.clinician.id));
      if (!ok) { skipped++; continue; }
      bucket(id); // ensure order + a bucket even if empty, so "no claims" is reported
    }
    for (const s of allSessions) {
      if (!s.clientId || !idSet.has(s.clientId) || !s.insurerId) continue;
      if (sessionsByClient.has(s.clientId)) sessionsByClient.get(s.clientId)!.push(s);
    }
  }

  const blocks: { name: string; forms: ReturnType<typeof buildClaimForms> }[] = [];
  for (const cid of order) {
    const client = await getClient(cid);
    if (!client) { skipped++; continue; }
    const forms = buildClaimForms(client, sessionsByClient.get(cid) ?? [], resolvers);
    if (forms.length === 0) { noClaims++; continue; }
    blocks.push({ name: `${client.first} ${client.last}`, forms });
  }
  blocks.sort((a, b) => a.name.localeCompare(b.name));

  const totalForms = blocks.reduce((t, b) => t + b.forms.length, 0);

  return (
    <div className="hcfa-page">
      <style dangerouslySetInnerHTML={{ __html: HCFA_CSS + OFFICIAL_CSS }} />
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
      ) : (
        <Cms1500Toggle
          official={blocks.map((b) => b.forms.map((f) => <Cms1500OfficialForm key={f.key} f={f} provider={prov} />))}
          sheet={blocks.map((b) => (
            <div key={b.name}>
              <div className="hcfa-clientlab">{b.name}</div>
              {b.forms.map((f) => <Cms1500Form key={f.key} f={f} provider={prov} />)}
            </div>
          ))}
        />
      )}
    </div>
  );
}
