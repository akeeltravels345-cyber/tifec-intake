import type { ClaimForm } from "@/lib/cms1500";

// A faithful facsimile of the official CMS-1500 (08-05) claim form, sized to US
// Letter (8.5 x 11"), rendered in the form's red so it prints looking like the
// real thing. Populated from a ClaimForm. Field positions mirror the paper form
// section by section. (For printing onto pre-printed red stock — data only — a
// separate data-only mode can be layered on; this draws the whole form.)

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const X = ({ on }: { on?: boolean }) => <span className="cf-x">{on ? "X" : ""}</span>;

/** Split a value into the little character combs some boxes use (dates as MM DD YY). */
function DateCells({ v }: { v?: string }) {
  const m = (v ?? "").match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  const [mm, dd, yy] = m ? [m[1], m[2], m[3]] : ["", "", ""];
  return <span className="cf-date"><i>{mm}</i><i>{dd}</i><i>{yy}</i></span>;
}

export default function Cms1500OfficialForm({ f, provider }: {
  f: ClaimForm;
  provider: { practiceName?: string; npi?: string; ein?: string; phone?: string; addressLine1?: string; addressLine2?: string; city?: string; region?: string; postal?: string; country?: string };
}) {
  const lines = [...f.lines];
  while (lines.length < 6) lines.push(null as unknown as (typeof f.lines)[number]);
  const provLine1 = provider.practiceName ?? "";
  const provLine2 = [provider.addressLine1, provider.addressLine2].filter(Boolean).join(" ");
  const provLine3 = [provider.city, provider.region, provider.postal].filter(Boolean).join(" ");

  return (
    <div className="cf-sheet">
      {/* ---- Carrier band ---- */}
      <div className="cf-carrier">
        <span className="cf-payer">{f.payerName}{f.carrierCode ? ` (# ${f.carrierCode})` : ""}</span>
        <span className="cf-carrierlab">CARRIER</span>
      </div>
      <div className="cf-titlebar">
        <span className="cf-1500">1500</span>
        <span className="cf-title">HEALTH INSURANCE CLAIM FORM</span>
        <span className="cf-approved">APPROVED BY NATIONAL UNIFORM CLAIM COMMITTEE 08/05</span>
        <span className="cf-pica">PICA</span>
      </div>

      {/* ---- Row 1: program | 1a insured id ---- */}
      <div className="cf-row">
        <div className="cf-c" style={{ flex: "1.55" }}>
          <b>1.</b> <span className="cf-progs">MEDICARE  MEDICAID  TRICARE  CHAMPVA  GROUP  FECA  <span className="cf-x">X</span> OTHER</span>
        </div>
        <div className="cf-c" style={{ flex: "1" }}><b>1a.</b> INSURED&apos;S I.D. NUMBER<div className="cf-v">{f.memberId}</div></div>
      </div>

      {/* ---- Row: 2 patient name | 3 dob/sex | 4 insured name ---- */}
      <div className="cf-row">
        <div className="cf-c" style={{ flex: "1.55" }}><b>2.</b> PATIENT&apos;S NAME (Last, First, MI)<div className="cf-v">{f.patientName}</div></div>
        <div className="cf-c" style={{ flex: ".9" }}><b>3.</b> PATIENT&apos;S BIRTH DATE<span className="cf-sub">SEX</span>
          <div className="cf-v cf-dobsex"><DateCells v={f.dob} /><span>M <X on={f.sex === "M"} />  F <X on={f.sex === "F"} /></span></div>
        </div>
        <div className="cf-c" style={{ flex: "1" }}><b>4.</b> INSURED&apos;S NAME (Last, First, MI)<div className="cf-v">{f.insuredName}</div></div>
      </div>

      {/* ---- Row: 5 patient address | 6 rel | 7 insured address ---- */}
      <div className="cf-row">
        <div className="cf-c" style={{ flex: "1.55" }}><b>5.</b> PATIENT&apos;S ADDRESS (No., Street)<div className="cf-v">{f.address}</div>
          <div className="cf-inline"><span>TEL <span className="cf-v cf-tel">{f.phone}</span></span></div>
        </div>
        <div className="cf-c" style={{ flex: ".9" }}><b>6.</b> PATIENT RELATIONSHIP TO INSURED
          <div className="cf-v cf-rel">Self <X on={f.relationship === "self"} /> Spouse <X on={f.relationship === "spouse"} /> Child <X on={f.relationship === "child"} /> Other <X on={f.relationship === "other"} /></div>
        </div>
        <div className="cf-c" style={{ flex: "1" }}><b>7.</b> INSURED&apos;S ADDRESS (No., Street)<div className="cf-v">{f.relationship === "self" ? f.address : ""}</div>
          <div className="cf-inline"><span>TEL <span className="cf-v cf-tel">{f.relationship === "self" ? f.phone : ""}</span></span></div>
        </div>
      </div>

      {/* ---- Row: 9 other insured | 10 condition | 11 insured policy ---- */}
      <div className="cf-row">
        <div className="cf-c" style={{ flex: "1.55" }}><b>9.</b> OTHER INSURED&apos;S NAME<div className="cf-v" /></div>
        <div className="cf-c" style={{ flex: ".9" }}><b>10.</b> IS PATIENT&apos;S CONDITION RELATED TO:
          <div className="cf-v cf-cond">a. EMPLOYMENT? YES <X /> NO <X on /></div>
          <div className="cf-v cf-cond">b. AUTO ACCIDENT? YES <X /> NO <X on /></div>
          <div className="cf-v cf-cond">c. OTHER ACCIDENT? YES <X /> NO <X on /></div>
          <div className="cf-inline"><span><b>10d.</b> RESERVED FOR LOCAL USE {f.carrierCode ? <span className="cf-v">{`# ${f.carrierCode}`}</span> : ""}</span></div>
        </div>
        <div className="cf-c" style={{ flex: "1" }}><b>11.</b> INSURED&apos;S POLICY GROUP OR FECA NUMBER<div className="cf-v">{f.groupNo}</div>
          <div className="cf-inline"><span><b>11a.</b> DOB <DateCells v={f.insuredDob} /></span></div>
          <div className="cf-inline"><span><b>11c.</b> PLAN NAME <span className="cf-v">{f.planName}</span></span></div>
          <div className="cf-inline"><span><b>11d.</b> ANOTHER HEALTH BENEFIT PLAN? YES <X /> NO <X on /></span></div>
        </div>
      </div>

      {/* ---- Row: 12 / 13 signatures ---- */}
      <div className="cf-row">
        <div className="cf-c" style={{ flex: "1.55" }}><b>12.</b> PATIENT&apos;S OR AUTHORIZED PERSON&apos;S SIGNATURE<div className="cf-v cf-sig">SIGNATURE ON FILE</div></div>
        <div className="cf-c" style={{ flex: "1.9" }}><b>13.</b> INSURED&apos;S OR AUTHORIZED PERSON&apos;S SIGNATURE<div className="cf-v cf-sig">SIGNATURE ON FILE</div></div>
      </div>

      {/* ---- Row: 14/15/16 | 17 referring | 18 hospitalization ---- */}
      <div className="cf-row">
        <div className="cf-c" style={{ flex: "1.55" }}><b>14.</b> DATE OF CURRENT ILLNESS / INJURY / PREGNANCY<div className="cf-v" /></div>
        <div className="cf-c" style={{ flex: ".9" }}><b>15.</b> IF PATIENT HAS HAD SAME OR SIMILAR ILLNESS<div className="cf-v" /></div>
        <div className="cf-c" style={{ flex: "1" }}><b>16.</b> DATES UNABLE TO WORK<div className="cf-v" /></div>
      </div>
      <div className="cf-row">
        <div className="cf-c" style={{ flex: "1.55" }}><b>17.</b> NAME OF REFERRING PROVIDER<div className="cf-v" /><div className="cf-inline"><span><b>17b.</b> NPI</span></div></div>
        <div className="cf-c" style={{ flex: ".9" }}><b>18.</b> HOSPITALIZATION DATES<div className="cf-v" /></div>
        <div className="cf-c" style={{ flex: "1" }}><b>20.</b> OUTSIDE LAB? YES <X /> NO <X on /><div className="cf-v" /></div>
      </div>
      <div className="cf-row">
        <div className="cf-c" style={{ flex: "1.55" }}><b>19.</b> RESERVED FOR LOCAL USE<div className="cf-v">{f.carrierCode ? `# ${f.carrierCode}` : ""}</div></div>
        <div className="cf-c" style={{ flex: "1.9" }}><b>22.</b> MEDICAID RESUBMISSION / ORIGINAL REF. NO.<div className="cf-v" /></div>
      </div>

      {/* ---- Row: 21 diagnosis | 22 | 23 ---- */}
      <div className="cf-row">
        <div className="cf-c" style={{ flex: "2" }}><b>21.</b> DIAGNOSIS OR NATURE OF ILLNESS OR INJURY (Relate to 24E by line)
          <div className="cf-dxgrid">
            {[0, 1, 2, 3].map((i) => <span key={i} className="cf-dx"><i>{i + 1}.</i> {f.diagnosis[i] ?? ""}</span>)}
          </div>
        </div>
        <div className="cf-c" style={{ flex: "1.45" }}><b>23.</b> PRIOR AUTHORIZATION NUMBER<div className="cf-v" /></div>
      </div>

      {/* ---- Box 24 service lines ---- */}
      <div className="cf-svc">
        <div className="cf-svchead">
          <span className="a">24. A&nbsp;&nbsp;DATE(S) OF SERVICE</span>
          <span className="b">B<small>POS</small></span>
          <span className="d">D&nbsp;&nbsp;CPT/HCPCS</span>
          <span className="mod">MOD</span>
          <span className="e">E<small>DX</small></span>
          <span className="f">F&nbsp;&nbsp;$ CHARGES</span>
          <span className="g">G<small>UNITS</small></span>
          <span className="j">J&nbsp;&nbsp;RENDERING NPI</span>
        </div>
        {lines.map((l, i) => (
          <div className="cf-svcrow" key={i}>
            <span className="a">{l ? <DateCells v={l.date} /> : ""}</span>
            <span className="b">{l?.pos ?? ""}</span>
            <span className="d">{l?.cpt ?? ""}</span>
            <span className="mod">{l?.mod ?? ""}</span>
            <span className="e">{l?.dxPointer ?? ""}</span>
            <span className="f">{l ? money(l.charge) : ""}</span>
            <span className="g">{l?.units ?? ""}</span>
            <span className="j">{l ? (l.renderingNpi || <em>{l.renderingName}</em>) : ""}</span>
          </div>
        ))}
      </div>

      {/* ---- Row: 25 | 26 | 27 | 28 | 29 | 30 ---- */}
      <div className="cf-row">
        <div className="cf-c" style={{ flex: "1.1" }}><b>25.</b> FEDERAL TAX I.D.<div className="cf-v">{provider.ein} {provider.ein ? <span className="cf-x">X</span> : ""} EIN</div></div>
        <div className="cf-c" style={{ flex: ".9" }}><b>27.</b> ACCEPT ASSIGNMENT?<div className="cf-v">YES <span className="cf-x">X</span>&nbsp;&nbsp;NO</div></div>
        <div className="cf-c" style={{ flex: ".7" }}><b>28.</b> TOTAL CHARGE<div className="cf-v">$ {money(f.total)}</div></div>
        <div className="cf-c" style={{ flex: ".7" }}><b>29.</b> AMOUNT PAID<div className="cf-v">$ {money(f.amountPaid)}</div></div>
        <div className="cf-c" style={{ flex: ".7" }}><b>30.</b> BALANCE DUE<div className="cf-v">$ {money(f.balanceDue)}</div></div>
      </div>

      {/* ---- Row: 31 | 32 | 33 ---- */}
      <div className="cf-row cf-last">
        <div className="cf-c" style={{ flex: "1.1" }}><b>31.</b> SIGNATURE OF PHYSICIAN OR SUPPLIER<div className="cf-v cf-sig">{f.signature}</div></div>
        <div className="cf-c" style={{ flex: "1.2" }}><b>32.</b> SERVICE FACILITY LOCATION<div className="cf-v cf-multiline">{provLine1}<br />{provLine2}<br />{provLine3}</div></div>
        <div className="cf-c" style={{ flex: "1.2" }}><b>33.</b> BILLING PROVIDER INFO &amp; PH# <span className="cf-v">{provider.phone}</span>
          <div className="cf-v cf-multiline">{provLine1}<br />{provLine2}<br />{provLine3}</div>
          <div className="cf-inline"><span><b>a.</b> NPI <span className="cf-v">{provider.npi}</span></span></div>
        </div>
      </div>

      <div className="cf-foot">APPROVED OMB-0938-0999 FORM CMS-1500 (08-05)</div>
    </div>
  );
}

export const OFFICIAL_CSS = `
.cf-sheet { width: 8.16in; min-height: 10.6in; background: #fff; color: #b0361f; border: 1.5px solid #d6431f;
  font-family: Arial, Helvetica, sans-serif; font-size: 7.2px; line-height: 1.15; margin: 0 auto 28px; padding: 10px 12px; position: relative; box-sizing: border-box; }
.cf-sheet b { color: #7a2414; font-weight: 700; }
.cf-sheet .cf-v { color: #10233b; font-size: 10px; font-weight: 600; margin-top: 2px; min-height: 12px; letter-spacing: .2px; }
.cf-sheet .cf-x { color: #10233b; font-weight: 800; }
.cf-carrier { display: flex; justify-content: center; align-items: center; position: relative; border-bottom: 1px solid #d6431f; padding-bottom: 3px; margin-bottom: 3px; }
.cf-payer { color: #10233b; font-weight: 700; font-size: 11px; }
.cf-carrierlab { position: absolute; right: 0; color: #b0361f; font-size: 6px; letter-spacing: 1px; }
.cf-titlebar { display: flex; align-items: center; gap: 8px; border-bottom: 1.5px solid #d6431f; padding-bottom: 4px; margin-bottom: 4px; }
.cf-1500 { border: 1.5px solid #b0361f; font-weight: 800; font-size: 12px; padding: 0 5px; color: #b0361f; }
.cf-title { font-weight: 800; font-size: 12px; letter-spacing: .3px; }
.cf-approved { font-size: 6px; }
.cf-pica { margin-left: auto; border: 1px solid #b0361f; padding: 1px 4px; letter-spacing: 3px; font-weight: 700; }
.cf-row { display: flex; border: 1px solid #e08a6f; border-top: none; }
.cf-row:first-of-type, .cf-titlebar + .cf-row { border-top: 1px solid #e08a6f; }
.cf-c { flex: 1; border-right: 1px solid #e08a6f; padding: 3px 5px 4px; min-height: 30px; }
.cf-c:last-child { border-right: none; }
.cf-sub { float: right; }
.cf-dobsex { display: flex; justify-content: space-between; align-items: center; }
.cf-date i { display: inline-block; min-width: 15px; border-bottom: 1px solid #cbb; text-align: center; margin-right: 3px; font-style: normal; }
.cf-inline { color: #7a2414; margin-top: 3px; font-size: 6.6px; }
.cf-inline .cf-v { display: inline; font-size: 9px; }
.cf-cond { font-size: 7px; }
.cf-rel { font-size: 8px; }
.cf-sig { font-style: italic; letter-spacing: .5px; }
.cf-tel { display: inline; }
.cf-progs { font-size: 6.4px; letter-spacing: .2px; }
.cf-dxgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 14px; margin-top: 3px; }
.cf-dx { color: #10233b; font-weight: 600; font-size: 9.5px; }
.cf-dx i { color: #7a2414; font-style: normal; font-weight: 700; }
.cf-svc { border: 1px solid #e08a6f; border-top: none; }
.cf-svchead { display: flex; background: #f7d9cd; border-bottom: 1px solid #d6431f; font-size: 6px; font-weight: 700; }
.cf-svchead span, .cf-svcrow span { padding: 2px 4px; border-right: 1px solid #e08a6f; }
.cf-svchead small { display: block; font-weight: 400; }
.cf-svcrow { display: flex; border-bottom: 1px solid #efd; min-height: 20px; align-items: center; }
.cf-svcrow .cf-date i { min-width: 13px; }
.cf-svc .a { flex: 2; } .cf-svc .b { flex: .5; } .cf-svc .d { flex: 1.1; } .cf-svc .mod { flex: .6; }
.cf-svc .e { flex: .5; } .cf-svc .f { flex: 1; text-align: right; } .cf-svc .g { flex: .5; } .cf-svc .j { flex: 1.3; }
.cf-svcrow span { color: #10233b; font-weight: 600; font-size: 9.5px; }
.cf-svcrow .j em { color: #9a6a5a; font-size: 7px; font-style: italic; font-weight: 500; }
.cf-multiline { font-size: 8.5px; line-height: 1.25; }
.cf-foot { text-align: right; font-size: 6px; margin-top: 4px; }
@media print {
  .hcfa-noprint, .bo-side, .bo-mobtabs, .tm-banner { display: none !important; }
  body, .bo-main { margin: 0 !important; padding: 0 !important; }
  .cf-sheet { border-color: #d6431f; break-after: page; page-break-after: always; margin: 0 auto; }
  .cf-sheet:last-of-type { break-after: auto; page-break-after: auto; }
  @page { size: letter; margin: 0.3in; }
}
`;
