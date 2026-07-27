import type { ClaimForm } from "@/lib/cms1500";

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Cell({ n, label, v, wide }: { n: string; label: string; v?: string | null; wide?: boolean }) {
  return (
    <div className={`hcfa-cell ${wide ? "wide" : ""}`}>
      <div className="hcfa-boxn">{n}</div>
      <div className="hcfa-cl">{label}</div>
      <div className="hcfa-cv">{v ? v : <span className="muted">—</span>}</div>
    </div>
  );
}

export default function Cms1500Form({ f, provider }: { f: ClaimForm; provider: {
  practiceName?: string; npi?: string; ein?: string; phone?: string;
  addressLine1?: string; addressLine2?: string; city?: string; region?: string; postal?: string; country?: string;
} }) {
  const provAddr = [provider.addressLine1, provider.addressLine2].filter(Boolean).join(", ");
  const provCity = [provider.city, provider.region, provider.postal].filter(Boolean).join(" ");
  return (
    <div className="hcfa">
      <div className="hcfa-title">
        <div className="t">Health Insurance Claim Form</div>
        <div className="s">CMS-1500 (08-05) · {f.payerName}{f.carrierCode ? ` (# ${f.carrierCode})` : ""}{f.pages > 1 ? ` · form ${f.page} of ${f.pages}` : ""}</div>
      </div>

      <div className="hcfa-grid">
        <Cell n="1a" label="Insured's ID number" v={f.memberId} wide />
        <Cell n="11c" label="Insurance plan / program" v={f.planName} wide />
        <Cell n="2" label="Patient's name (Last, First)" v={f.patientName} wide />
        <Cell n="4" label="Insured's name (Last, First)" v={f.insuredName} wide />
        <Cell n="3" label="Patient birth date / sex" v={[f.dob, f.sex].filter(Boolean).join("  ·  ")} />
        <Cell n="6" label="Patient relationship to insured" v={f.relationship} />
        <Cell n="11a" label="Insured's birth date" v={f.insuredDob} />
        <Cell n="11" label="Insured's group / policy no." v={f.groupNo} />
        <Cell n="5" label="Patient's address" v={f.address} wide />
        <Cell n="5b" label="Telephone" v={f.phone} />
        <Cell n="10d" label="Reserved for local use" v={f.carrierCode ? `# ${f.carrierCode}` : ""} />
      </div>

      {/* Standard authorisations — boxes 10a-c, 12/13, 27. */}
      <div className="hcfa-static">
        <span><b>10a-c</b> Condition related to employment / auto / other: <b>No</b></span>
        <span><b>12 &amp; 13</b> Patient / insured signature: <b>Signature on file</b></span>
        <span><b>27</b> Accept assignment: <b>Yes</b></span>
      </div>

      <div className="hcfa-dx">
        <div className="hcfa-boxn">21</div>
        <div className="hcfa-dxlab">Diagnosis (ICD-10) · pointers 1-4</div>
        <div className="hcfa-dxlist">
          {f.diagnosis.length === 0 ? <span className="muted">— none on file —</span> :
            f.diagnosis.slice(0, 4).map((d, i) => <span className="hcfa-dxi" key={d}><b>{i + 1}</b> {d}</span>)}
        </div>
      </div>

      <table className="hcfa-svc">
        <thead>
          <tr>
            <th>24A · Date(s)</th><th>24B · POS</th><th>24D · CPT/HCPCS</th><th>Mod</th>
            <th>24E · Dx</th><th className="r">24F · Charges</th><th className="r">24G · Units</th><th>24J · Rendering NPI</th>
          </tr>
        </thead>
        <tbody>
          {f.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.date}</td>
              <td>{l.pos}</td>
              <td>{l.cpt || "—"}</td>
              <td>{l.mod}</td>
              <td>{l.dxPointer}</td>
              <td className="r">{money(l.charge)}</td>
              <td className="r">{l.units}</td>
              <td>{l.renderingNpi || <span className="muted">{l.renderingName}</span>}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}></td>
            <td className="r"><b>28 · Total charge</b></td>
            <td className="r"><b>{money(f.total)}</b></td>
            <td className="r" colSpan={2}>
              <span className="hcfa-tfnum"><b>29 · Amount paid</b> {money(f.amountPaid)}</span>
              <span className="hcfa-tfnum"><b>30 · Balance due</b> {money(f.balanceDue)}</span>
            </td>
          </tr>
        </tfoot>
      </table>

      <div className="hcfa-grid">
        <Cell n="25" label="Federal Tax ID (EIN)" v={provider.ein} />
        <Cell n="31" label="Signature of provider" v={f.signature} />
        <Cell n="32" label="Service facility location" v={[provider.practiceName, provAddr, provCity].filter(Boolean).join(" · ")} wide />
        <Cell n="33" label="Billing provider" v={[provider.practiceName, provider.phone].filter(Boolean).join(" · ")} />
        <Cell n="33a" label="Billing provider NPI" v={provider.npi} />
      </div>
    </div>
  );
}

export const HCFA_CSS = `
.hcfa-page { max-width: 900px; }
.hcfa-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.hcfa-warn { border: 1px solid #e7d9b0; background: #fdf6e3; color: #6b5a2a; border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 14px; }
.hcfa-warn a { color: var(--indigo, #3b3f8f); font-weight: 600; }
.hcfa-clientlab { font: 600 15px "Newsreader", serif; color: #4a5262; margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e3e7ee; }
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
.hcfa-svc tfoot td { border-bottom: none; padding-top: 8px; }
.hcfa-tfnum { display: inline-block; margin-left: 16px; font-size: 12px; color: #4a5262; }
.hcfa-tfnum b { color: #7b8393; font-weight: 700; margin-right: 4px; }
.hcfa-static { display: flex; flex-wrap: wrap; gap: 10px 22px; font-size: 12px; color: #5b6472; border: 1px dashed #d6dae2; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; }
.hcfa-static b { color: #3a414e; }
@media print {
  .hcfa-noprint, .bo-side, .bo-mobtabs, .tm-banner { display: none !important; }
  body, .bo-main { margin: 0 !important; padding: 0 !important; }
  .hcfa { break-inside: avoid; page-break-inside: avoid; border-color: #000; }
  .hcfa-clientlab { break-before: page; page-break-before: always; }
  .hcfa-clientlab:first-of-type { break-before: auto; page-break-before: auto; }
  .hcfa-page { max-width: none; }
}
`;
