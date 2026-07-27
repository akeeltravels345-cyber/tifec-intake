import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { listInsurers, listSessions, getPracticeConfig, listExternalClinicians } from "@/lib/billing";
import { insurancePortion } from "@/lib/billingCalc";
import { getClient, clinicianSeesClient } from "@/lib/clients";
import { getClinician } from "@/lib/clinicians";
import PrintButton from "@/components/billing/PrintButton";

export const dynamic = "force-dynamic";

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DX_LETTERS = "ABCDEFGHIJKL".split("");

export default async function Cms1500Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getBillingUser();
  if (!user) redirect(`/login?next=/billing/clients/${id}/cms1500`);

  const client = await getClient(id);
  if (!client) notFound();

  const seesAll = isBiller(user.role) || isOwner(user.role);
  if (!seesAll && !(await clinicianSeesClient(id, user.clinician.id))) redirect("/billing/clients");

  const [insurers, cfg, external, sessions] = await Promise.all([
    listInsurers(), getPracticeConfig(), listExternalClinicians(),
    seesAll ? listSessions({ clientId: id }) : listSessions({ clientId: id, clinicianId: user.clinician.id }),
  ]);
  const insName = (idv: string | null) => insurers.find((i) => i.id === idv)?.name ?? "";
  const clinName = (cid: string) => getClinician(cid)?.name ?? external.find((c) => c.id === cid)?.name ?? cid;
  const prov = cfg.provider ?? {};
  const renderingNpi = (cid: string) => prov.renderingNpi?.[cid] ?? "";

  // A CMS-1500 has one payer, so we produce one claim per insurer the client has
  // billable (insured) sessions under. Up to 6 service lines per form.
  const billable = sessions.filter((s) => s.insurerId && insurancePortion(s) > 0);
  const byInsurer = new Map<string, typeof billable>();
  for (const s of billable) {
    const k = s.insurerId as string;
    if (!byInsurer.has(k)) byInsurer.set(k, []);
    byInsurer.get(k)!.push(s);
  }
  const claims = [...byInsurer.entries()];

  const p = client.profile;
  const patientName = `${client.last}, ${client.first}`;
  const selfInsured = !p.insurance?.relationship || p.insurance.relationship === "self";
  const insuredName = selfInsured ? patientName : `${p.insurance?.insuredLast ?? ""}, ${p.insurance?.insuredFirst ?? ""}`;
  const addr = [p.address?.line1, p.address?.line2].filter(Boolean).join(", ");
  const cityLine = [p.address?.city, p.address?.region, p.address?.postal].filter(Boolean).join(" ");
  const dx = p.diagnosis ?? [];
  const provAddr = [prov.addressLine1, prov.addressLine2].filter(Boolean).join(", ");
  const provCity = [prov.city, prov.region, prov.postal].filter(Boolean).join(" ");

  return (
    <div className="hcfa-page">
      <style dangerouslySetInnerHTML={{ __html: HCFA_CSS }} />

      <div className="hcfa-bar hcfa-noprint">
        <Link href={`/billing/clients/${id}`} className="ls-back">← Back to client</Link>
        <div style={{ flex: 1 }} />
        <PrintButton label="Print / Save PDF" className="bl-cta hcfa-noprint" />
      </div>

      {(!prov.npi || !prov.ein) && (
        <div className="hcfa-warn hcfa-noprint">
          Provider identifiers aren&apos;t set yet, so boxes 25, 31–33 (Tax ID, NPI, billing provider) will print blank.
          Add them in <Link href="/billing/config">Setup</Link> once you have them.
        </div>
      )}

      {claims.length === 0 ? (
        <div className="hcfa-warn hcfa-noprint">This client has no insured sessions to claim. Self-pay visits don&apos;t go on a CMS-1500.</div>
      ) : claims.map(([insurerId, lines]) => (
        <div className="hcfa" key={insurerId}>
          <div className="hcfa-title">
            <div className="t">Health Insurance Claim Form</div>
            <div className="s">CMS-1500 · {insName(insurerId)}{lines.length > 6 ? ` · ${lines.length} lines (first 6 shown)` : ""}</div>
          </div>

          <div className="hcfa-grid">
            <Cell n="1a" label="Insured's ID number" v={p.insurance?.memberId} wide />
            <Cell n="11c" label="Insurance plan / program" v={p.insurance?.planName || insName(insurerId)} wide />

            <Cell n="2" label="Patient's name (Last, First)" v={patientName} wide />
            <Cell n="4" label="Insured's name (Last, First)" v={insuredName} wide />

            <Cell n="3" label="Patient birth date / sex" v={[p.dob, p.sex].filter(Boolean).join("  ·  ")} />
            <Cell n="6" label="Patient relationship to insured" v={p.insurance?.relationship ?? "self"} />
            <Cell n="11a" label="Insured's birth date" v={selfInsured ? p.dob : p.insurance?.insuredDob} />
            <Cell n="11" label="Insured's group / policy no." v={p.insurance?.groupNo} />

            <Cell n="5" label="Patient's address" v={[addr, cityLine, p.address?.country].filter(Boolean).join(" · ")} wide />
            <Cell n="5b" label="Telephone" v={p.phone} wide />
          </div>

          {/* Box 21 — diagnosis */}
          <div className="hcfa-dx">
            <div className="hcfa-boxn">21</div>
            <div className="hcfa-dxlab">Diagnosis (ICD-10)</div>
            <div className="hcfa-dxlist">
              {dx.length === 0 ? <span className="muted">— none on file —</span> :
                dx.slice(0, 12).map((d, i) => <span className="hcfa-dxi" key={d}><b>{DX_LETTERS[i]}</b> {d}</span>)}
            </div>
          </div>

          {/* Box 24 — service lines */}
          <table className="hcfa-svc">
            <thead>
              <tr>
                <th>24A · Date(s)</th><th>24B · POS</th><th>24D · CPT/HCPCS</th><th>Mod</th>
                <th>24E · Dx</th><th className="r">24F · Charges</th><th className="r">24G · Units</th><th>24J · Rendering NPI</th>
              </tr>
            </thead>
            <tbody>
              {lines.slice(0, 6).map((s) => (
                <tr key={s.id}>
                  <td>{s.dateOfService}</td>
                  <td>11</td>
                  <td>{s.cptCodes.join(", ") || "—"}</td>
                  <td></td>
                  <td>{dx.length ? "A" : ""}</td>
                  <td className="r">{money(s.totalCost)}</td>
                  <td className="r">{Math.max(1, Math.round(s.durationHours || 1))}</td>
                  <td>{renderingNpi(s.clinicianId) || <span className="muted">{clinName(s.clinicianId)}</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="r"><b>28 · Total charge</b></td>
                <td className="r"><b>{money(lines.slice(0, 6).reduce((t, s) => t + s.totalCost, 0))}</b></td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>

          {/* Provider footer — boxes 25, 31, 32, 33 */}
          <div className="hcfa-grid">
            <Cell n="25" label="Federal Tax ID (EIN)" v={prov.ein} />
            <Cell n="31" label="Signature of provider" v={lines[0] ? clinName(lines[0].clinicianId) : ""} />
            <Cell n="32" label="Service facility location" v={[prov.practiceName, provAddr, provCity].filter(Boolean).join(" · ")} wide />
            <Cell n="33" label="Billing provider" v={[prov.practiceName, prov.phone].filter(Boolean).join(" · ")} />
            <Cell n="33a" label="Billing provider NPI" v={prov.npi} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Cell({ n, label, v, wide }: { n: string; label: string; v?: string | null; wide?: boolean }) {
  return (
    <div className={`hcfa-cell ${wide ? "wide" : ""}`}>
      <div className="hcfa-boxn">{n}</div>
      <div className="hcfa-cl">{label}</div>
      <div className="hcfa-cv">{v ? v : <span className="muted">—</span>}</div>
    </div>
  );
}

const HCFA_CSS = `
.hcfa-page { max-width: 900px; }
.hcfa-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.hcfa-warn { border: 1px solid #e7d9b0; background: #fdf6e3; color: #6b5a2a; border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 14px; }
.hcfa-warn a { color: var(--indigo, #3b3f8f); font-weight: 600; }
.hcfa { border: 1.5px solid #1c2330; border-radius: 8px; padding: 16px; margin-bottom: 28px; background: #fff; }
.hcfa-title { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #1c2330; padding-bottom: 8px; margin-bottom: 12px; }
.hcfa-title .t { font: 600 17px "Newsreader", serif; }
.hcfa-title .s { font-size: 12.5px; color: #555; font-weight: 600; }
.hcfa-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
.hcfa-cell { position: relative; border: 1px solid #c3c9d4; border-radius: 6px; padding: 7px 9px 7px 34px; min-height: 44px; }
.hcfa-cell.wide { grid-column: span 2; }
.hcfa-boxn { position: absolute; left: 6px; top: 6px; font-size: 10px; font-weight: 800; color: #8a93a3; background: #eef1f6; border-radius: 4px; padding: 1px 4px; min-width: 16px; text-align: center; }
.hcfa-cl { font-size: 10.5px; text-transform: uppercase; letter-spacing: .03em; color: #7b8393; }
.hcfa-cv { font-size: 14px; color: #1c2330; margin-top: 2px; }
.hcfa .muted { color: #aab0bd; }
.hcfa-dx { position: relative; border: 1px solid #c3c9d4; border-radius: 6px; padding: 7px 9px 7px 34px; margin-bottom: 12px; }
.hcfa-dxlab { font-size: 10.5px; text-transform: uppercase; letter-spacing: .03em; color: #7b8393; }
.hcfa-dxlist { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 4px; font-size: 14px; }
.hcfa-dxi b { color: #8a93a3; margin-right: 3px; }
.hcfa-svc { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 13px; }
.hcfa-svc th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .02em; color: #7b8393; border-bottom: 1.5px solid #1c2330; padding: 5px 7px; }
.hcfa-svc td { padding: 6px 7px; border-bottom: 1px solid #e3e7ee; }
.hcfa-svc .r { text-align: right; }
.hcfa-svc tfoot td { border-bottom: none; }
@media print {
  .hcfa-noprint, .bo-side, .bo-mobtabs, .tm-banner { display: none !important; }
  body, .bo-main { margin: 0 !important; padding: 0 !important; }
  .hcfa { break-inside: avoid; page-break-inside: avoid; border-color: #000; }
  .hcfa-page { max-width: none; }
}
`;
