import type { ClaimForm } from "@/lib/cms1500";

// A faithful facsimile of the official CMS-1500 (02/12) health insurance claim
// form — the current NUCC/OMB 0938-1197 edition — sized to US Letter and drawn in
// the form's red so the printed copy reads like the real thing. Populated from a
// ClaimForm; every box on the paper form is present in position, blanks included.

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const Box = ({ on }: { on?: boolean }) => <span className="cf-box">{on ? "X" : ""}</span>;

/** MM DD YY split into the little character comb the date boxes use. */
function DateCells({ v }: { v?: string }) {
  const m = (v ?? "").match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  const [mm, dd, yy] = m ? [m[1], m[2], m[3]] : ["", "", ""];
  return <span className="cf-datecomb"><i>{mm}</i><i>{dd}</i><i>{yy}</i></span>;
}

export default function Cms1500OfficialForm({ f, provider }: {
  f: ClaimForm;
  provider: { practiceName?: string; npi?: string; ein?: string; phone?: string; addressLine1?: string; addressLine2?: string; city?: string; region?: string; postal?: string; country?: string };
}) {
  const lines = [...f.lines];
  while (lines.length < 6) lines.push(null as unknown as (typeof f.lines)[number]);
  const facility = [provider.practiceName, [provider.addressLine1, provider.addressLine2].filter(Boolean).join(" "), [provider.city, provider.region, provider.postal].filter(Boolean).join(" ")].filter(Boolean);
  const dxLetters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

  return (
    <div className="cf-sheet">
      {/* Right-edge section labels */}
      <span className="cf-edge carrier">CARRIER</span>
      <span className="cf-edge patient">PATIENT AND INSURED INFORMATION</span>
      <span className="cf-edge phys">PHYSICIAN OR SUPPLIER INFORMATION</span>

      {/* Header */}
      <div className="cf-head">
        <div className="cf-headL">
          <div className="cf-barcode" aria-hidden="true" />
          <div className="cf-pica"><span className="b">PICA</span><span className="cf-picabox" /><span className="cf-picabox" /></div>
        </div>
        <div className="cf-headC">
          <div className="cf-title">HEALTH INSURANCE CLAIM FORM</div>
          <div className="cf-sub">APPROVED BY NATIONAL UNIFORM CLAIM COMMITTEE (NUCC) 02/12</div>
        </div>
        <div className="cf-headR"><span className="cf-picabox" /><span className="cf-picabox" /><span className="b">PICA</span></div>
      </div>

      {/* Row 1: program checkboxes | 1a insured id */}
      <div className="cf-row">
        <div className="cf-c f2">
          <div className="n">1.</div>
          <div className="cf-progs">
            <span>MEDICARE <Box /></span><span>MEDICAID <Box /></span><span>TRICARE <Box /></span>
            <span>CHAMPVA <Box /></span><span>GROUP<br />HEALTH PLAN <Box on /></span><span>FECA<br />BLK LUNG <Box /></span><span>OTHER <Box /></span>
          </div>
        </div>
        <div className="cf-c f1"><div className="n">1a.</div>INSURED&apos;S I.D. NUMBER<div className="v">{f.memberId}</div></div>
      </div>

      {/* Row: 2 patient | 3 dob/sex | 4 insured */}
      <div className="cf-row">
        <div className="cf-c f2"><div className="n">2.</div>PATIENT&apos;S NAME (Last Name, First Name, Middle Initial)<div className="v">{f.patientName}</div></div>
        <div className="cf-c f1"><div className="n">3.</div>PATIENT&apos;S BIRTH DATE<span className="r">SEX</span>
          <div className="v cf-dobsex"><DateCells v={f.dob} /><span className="cf-sexes">M <Box on={f.sex === "M"} /> F <Box on={f.sex === "F"} /></span></div>
        </div>
        <div className="cf-c f1"><div className="n">4.</div>INSURED&apos;S NAME (Last Name, First Name, Middle Initial)<div className="v">{f.insuredName}</div></div>
      </div>

      {/* Rows: 5 patient address | 6 relationship / 8 reserved | 7 insured address */}
      <div className="cf-row cf-addrblock">
        <div className="cf-c f2 cf-addr">
          <div className="cf-addrtop"><div className="n">5.</div>PATIENT&apos;S ADDRESS (No., Street)<div className="v">{f.patientAddr.street}</div></div>
          <div className="cf-addrsub"><span className="cf-lbl">CITY<div className="v">{f.patientAddr.city}</div></span><span className="cf-lbl st">STATE<div className="v">{f.patientAddr.state}</div></span></div>
          <div className="cf-addrsub"><span className="cf-lbl">ZIP CODE<div className="v">{f.patientAddr.zip}</div></span><span className="cf-lbl tel">TELEPHONE (Include Area Code)<div className="v">{f.phone}</div></span></div>
        </div>
        <div className="cf-c f1 cf-mid">
          <div className="cf-midtop"><div className="n">6.</div>PATIENT RELATIONSHIP TO INSURED
            <div className="v cf-rel">Self <Box on={f.relationship === "self"} /> Spouse <Box on={f.relationship === "spouse"} /> Child <Box on={f.relationship === "child"} /> Other <Box on={f.relationship === "other"} /></div>
          </div>
          <div className="cf-midbot"><div className="n">8.</div>RESERVED FOR NUCC USE</div>
        </div>
        <div className="cf-c f1 cf-addr">
          <div className="cf-addrtop"><div className="n">7.</div>INSURED&apos;S ADDRESS (No., Street)<div className="v">{f.insuredAddr.street}</div></div>
          <div className="cf-addrsub"><span className="cf-lbl">CITY<div className="v">{f.insuredAddr.city}</div></span><span className="cf-lbl st">STATE<div className="v">{f.insuredAddr.state}</div></span></div>
          <div className="cf-addrsub"><span className="cf-lbl">ZIP CODE<div className="v">{f.insuredAddr.zip}</div></span><span className="cf-lbl tel">TELEPHONE (Include Area Code)<div className="v"></div></span></div>
        </div>
      </div>

      {/* Rows: 9 other insured | 10 condition | 11 insured policy */}
      <div className="cf-row cf-cond3">
        <div className="cf-c f2 cf-stack">
          <div className="cf-s"><div className="n">9.</div>OTHER INSURED&apos;S NAME (Last Name, First Name, Middle Initial)<div className="v"></div></div>
          <div className="cf-s"><div className="n">a.</div>OTHER INSURED&apos;S POLICY OR GROUP NUMBER<div className="v"></div></div>
          <div className="cf-s"><div className="n">b.</div>RESERVED FOR NUCC USE</div>
          <div className="cf-s"><div className="n">c.</div>RESERVED FOR NUCC USE</div>
          <div className="cf-s"><div className="n">d.</div>INSURANCE PLAN NAME OR PROGRAM NAME<div className="v"></div></div>
        </div>
        <div className="cf-c f1 cf-stack">
          <div className="cf-s cf-condhdr"><div className="n">10.</div>IS PATIENT&apos;S CONDITION RELATED TO:</div>
          <div className="cf-s cf-yn"><span>a. EMPLOYMENT? (Current or Previous)</span><span className="yn">YES <Box /> NO <Box on /></span></div>
          <div className="cf-s cf-yn"><span>b. AUTO ACCIDENT?</span><span className="yn">YES <Box /> NO <Box on /></span></div>
          <div className="cf-s cf-yn"><span>c. OTHER ACCIDENT?</span><span className="yn">YES <Box /> NO <Box on /></span></div>
          <div className="cf-s"><div className="n">10d.</div>CLAIM CODES (Designated by NUCC)<div className="v">{f.carrierCode}</div></div>
        </div>
        <div className="cf-c f1 cf-stack">
          <div className="cf-s"><div className="n">11.</div>INSURED&apos;S POLICY GROUP OR FECA NUMBER<div className="v">{f.groupNo}</div></div>
          <div className="cf-s cf-yn"><span>a. INSURED&apos;S DATE OF BIRTH</span><span className="yn"><DateCells v={f.insuredDob} /> M <Box on={f.insuredSex === "M"} /> F <Box on={f.insuredSex === "F"} /></span></div>
          <div className="cf-s"><div className="n">b.</div>OTHER CLAIM ID (Designated by NUCC)<div className="v"></div></div>
          <div className="cf-s"><div className="n">c.</div>INSURANCE PLAN NAME OR PROGRAM NAME<div className="v">{f.planName}</div></div>
          <div className="cf-s cf-yn"><span>d. IS THERE ANOTHER HEALTH BENEFIT PLAN?</span><span className="yn">YES <Box /> NO <Box on /></span></div>
        </div>
      </div>

      {/* Rows: 12 / 13 signatures */}
      <div className="cf-row">
        <div className="cf-c f2"><div className="n">12.</div>PATIENT&apos;S OR AUTHORIZED PERSON&apos;S SIGNATURE<div className="v sig">SIGNATURE ON FILE<span className="cf-sigdate">DATE</span></div></div>
        <div className="cf-c f2"><div className="n">13.</div>INSURED&apos;S OR AUTHORIZED PERSON&apos;S SIGNATURE<div className="v sig">SIGNATURE ON FILE</div></div>
      </div>

      {/* Rows 14-16 */}
      <div className="cf-row">
        <div className="cf-c f1"><div className="n">14.</div>DATE OF CURRENT ILLNESS, INJURY, or PREGNANCY (LMP)<div className="v"></div></div>
        <div className="cf-c f1"><div className="n">15.</div>OTHER DATE<div className="v"></div></div>
        <div className="cf-c f1"><div className="n">16.</div>DATES PATIENT UNABLE TO WORK<div className="v"></div></div>
      </div>
      {/* Rows 17-18 */}
      <div className="cf-row">
        <div className="cf-c f2"><div className="n">17.</div>NAME OF REFERRING PROVIDER OR OTHER SOURCE<div className="v"></div>
          <div className="cf-npisub"><span>17a.</span><span>17b. NPI</span></div>
        </div>
        <div className="cf-c f2"><div className="n">18.</div>HOSPITALIZATION DATES RELATED TO CURRENT SERVICES<div className="v"></div></div>
      </div>
      {/* Rows 19-20 */}
      <div className="cf-row">
        <div className="cf-c f2"><div className="n">19.</div>ADDITIONAL CLAIM INFORMATION (Designated by NUCC)<div className="v"></div></div>
        <div className="cf-c f1"><div className="n">20.</div>OUTSIDE LAB?<div className="v cf-lab">NO <Box on /><span className="cf-charges">$ CHARGES</span></div></div>
      </div>
      {/* Rows 21-23 */}
      <div className="cf-row cf-cond3">
        <div className="cf-c f2 cf-dxbox">
          <div className="cf-dxhdr"><div className="n">21.</div>DIAGNOSIS OR NATURE OF ILLNESS OR INJURY (Relate A-L to service line below 24E)<span className="cf-icdind">ICD Ind. <b>0</b></span></div>
          <div className="cf-dxgrid">
            {dxLetters.map((L, i) => <span key={L} className="cf-dx"><i>{L}.</i> {f.diagnosis[i] ?? ""}</span>)}
          </div>
        </div>
        <div className="cf-c f1 cf-stack">
          <div className="cf-s"><div className="n">22.</div>RESUBMISSION CODE / ORIGINAL REF. NO.<div className="v"></div></div>
          <div className="cf-s"><div className="n">23.</div>PRIOR AUTHORIZATION NUMBER<div className="v"></div></div>
        </div>
      </div>

      {/* Box 24 service lines */}
      <div className="cf-svc">
        <div className="cf-svchead">
          <span className="a">24. A. DATE(S) OF SERVICE<small>From — To</small></span>
          <span className="b">B.<small>POS</small></span>
          <span className="c">C.<small>EMG</small></span>
          <span className="d">D. PROCEDURES / SERVICES<small>CPT/HCPCS · MODIFIER</small></span>
          <span className="e">E.<small>DX</small></span>
          <span className="f">F.<small>$ CHARGES</small></span>
          <span className="g">G.<small>UNITS</small></span>
          <span className="h">H.<small>EPSDT</small></span>
          <span className="i">I.<small>ID QUAL</small></span>
          <span className="j">J. RENDERING<small>PROVIDER ID #</small></span>
        </div>
        {lines.map((l, i) => (
          <div className="cf-svcrow" key={i}>
            <span className="a">{l ? <span className="cf-fromto"><DateCells v={l.date} /><DateCells v={l.date} /></span> : ""}</span>
            <span className="b">{l?.pos ?? ""}</span>
            <span className="c"></span>
            <span className="d"><span className="cpt">{l?.cpt ?? ""}</span><span className="mod">{l?.mod ?? ""}</span></span>
            <span className="e">{l?.dxPointer ?? ""}</span>
            <span className="f">{l ? money(l.charge) : ""}</span>
            <span className="g">{l?.units ?? ""}</span>
            <span className="h"></span>
            <span className="i">{l ? "NPI" : ""}</span>
            <span className="j">{l ? (l.renderingNpi || <em>{l.renderingName}</em>) : ""}</span>
          </div>
        ))}
      </div>

      {/* Rows 25-30 */}
      <div className="cf-row">
        <div className="cf-c f1"><div className="n">25.</div>FEDERAL TAX I.D. NUMBER<span className="r">SSN <Box /> EIN <Box on={!!provider.ein} /></span><div className="v">{provider.ein}</div></div>
        <div className="cf-c f1"><div className="n">26.</div>PATIENT&apos;S ACCOUNT NO.<div className="v"></div></div>
        <div className="cf-c f1"><div className="n">27.</div>ACCEPT ASSIGNMENT?<div className="v cf-rel">YES <Box on /> NO <Box /></div></div>
        <div className="cf-c f1"><div className="n">28.</div>TOTAL CHARGE<div className="v">$ {money(f.total)}</div></div>
        <div className="cf-c f1"><div className="n">29.</div>AMOUNT PAID<div className="v">$ {money(f.amountPaid)}</div></div>
        <div className="cf-c f1"><div className="n">30.</div>Rsvd for NUCC Use</div>
      </div>

      {/* Rows 31-33 */}
      <div className="cf-row cf-last">
        <div className="cf-c f1"><div className="n">31.</div>SIGNATURE OF PHYSICIAN OR SUPPLIER<span className="cf-tiny">INCLUDING DEGREES OR CREDENTIALS</span><div className="v sig">{f.signature}</div></div>
        <div className="cf-c f1 cf-fac"><div className="n">32.</div>SERVICE FACILITY LOCATION INFORMATION<div className="v cf-multi">{facility.map((x, k) => <span key={k}>{x}</span>)}</div>
          <div className="cf-npisub"><span>a. {provider.npi}</span><span>b.</span></div>
        </div>
        <div className="cf-c f1 cf-fac"><div className="n">33.</div>BILLING PROVIDER INFO &amp; PH# <span className="v cf-ph">{provider.phone}</span><div className="v cf-multi">{facility.map((x, k) => <span key={k}>{x}</span>)}</div>
          <div className="cf-npisub"><span>a. {provider.npi}</span><span>b.</span></div>
        </div>
      </div>

      <div className="cf-foot">
        <span>NUCC Instruction Manual available at: www.nucc.org</span>
        <span className="mid">PLEASE PRINT OR TYPE</span>
        <span>APPROVED OMB-0938-1197 FORM 1500 (02-12)</span>
      </div>
    </div>
  );
}

export const OFFICIAL_CSS = `
.cf-sheet { --fr: #c9322d; --fd: #0d1b2a; position: relative; width: 8.4in; min-height: 10.9in; margin: 0 auto 28px; padding: 12px 26px 10px 14px; box-sizing: border-box;
  background: #fff; color: var(--fr); font-family: Arial, Helvetica, sans-serif; font-size: 6.6px; line-height: 1.12; }
.cf-sheet .b { font-weight: 800; }
.cf-sheet .v { color: var(--fd); font-size: 9.5px; font-weight: 600; letter-spacing: .2px; min-height: 11px; margin-top: 1px; }
.cf-box { display: inline-block; width: 9px; height: 9px; border: 1px solid var(--fr); text-align: center; line-height: 8px; color: var(--fd); font-weight: 800; font-size: 8px; vertical-align: -1px; margin: 0 2px; }
/* Right-edge vertical section labels */
.cf-edge { position: absolute; right: 2px; writing-mode: vertical-rl; text-orientation: mixed; font-weight: 700; font-size: 7px; letter-spacing: 1.5px; color: var(--fr); }
.cf-edge.carrier { top: 60px; } .cf-edge.patient { top: 210px; } .cf-edge.phys { top: 560px; }
/* Header */
.cf-head { display: flex; align-items: flex-end; gap: 10px; margin-bottom: 6px; }
.cf-headL, .cf-headR { display: flex; align-items: center; gap: 3px; min-width: 120px; }
.cf-headR { justify-content: flex-end; }
.cf-headC { flex: 1; text-align: left; }
.cf-barcode { width: 38px; height: 26px; background: repeating-linear-gradient(90deg, var(--fd) 0 1px, #fff 1px 3px); opacity: .5; }
.cf-title { font-weight: 800; font-size: 14px; letter-spacing: .3px; color: var(--fr); }
.cf-sub { font-size: 7px; }
.cf-pica, .cf-headR { font-size: 8px; letter-spacing: 2px; }
.cf-picabox { display: inline-block; width: 10px; height: 11px; border: 1px solid var(--fr); }
/* Rows + cells */
.cf-row { display: flex; border: 1px solid var(--fr); border-top: none; }
.cf-head + .cf-row { border-top: 1px solid var(--fr); }
.cf-c { position: relative; flex: 1; border-right: 1px solid var(--fr); padding: 3px 5px 4px 16px; min-height: 30px; }
.cf-c:last-child { border-right: none; }
.cf-c.f1 { flex: 1; } .cf-c.f2 { flex: 2; }
.cf-c .n { position: absolute; left: 3px; top: 3px; font-weight: 800; font-size: 6.6px; }
.cf-c .r { float: right; }
.cf-progs { display: flex; flex-wrap: wrap; gap: 2px 6px; font-size: 6px; margin-top: 1px; }
.cf-dobsex { display: flex; justify-content: space-between; align-items: center; }
.cf-sexes { white-space: nowrap; }
.cf-datecomb i { display: inline-block; min-width: 15px; border-bottom: 1px solid #d9b8b2; text-align: center; margin-right: 2px; font-style: normal; color: var(--fd); font-size: 9px; }
.sig { font-style: italic; letter-spacing: .4px; }
.cf-sigdate { float: right; font-style: normal; color: var(--fr); }
/* Address block */
.cf-addr { padding-left: 16px; }
.cf-addrtop { position: relative; padding-left: 0; }
.cf-addrsub { display: flex; border-top: 1px solid #edcfca; margin-top: 3px; padding-top: 2px; }
.cf-lbl { flex: 1; padding-right: 6px; } .cf-lbl.st { flex: .5; } .cf-lbl.tel { flex: 1.4; }
.cf-mid { display: flex; flex-direction: column; padding-left: 5px; }
.cf-midtop { position: relative; padding-left: 11px; }
.cf-midbot { position: relative; padding-left: 16px; border-top: 1px solid #edcfca; margin-top: 4px; padding-top: 3px; }
.cf-rel { white-space: nowrap; }
/* Stacked cells (9/10/11, 22/23) */
.cf-stack { display: flex; flex-direction: column; padding: 0; }
.cf-s { position: relative; padding: 3px 5px 3px 16px; border-top: 1px solid #edcfca; min-height: 18px; }
.cf-s:first-child { border-top: none; }
.cf-condhdr { font-weight: 700; }
.cf-yn { display: flex; justify-content: space-between; align-items: center; gap: 6px; padding-left: 5px; }
.cf-yn .yn { white-space: nowrap; }
/* 17 NPI sub */
.cf-npisub { display: flex; gap: 8px; border-top: 1px solid #edcfca; margin-top: 3px; padding-top: 2px; font-size: 6.6px; }
.cf-npisub span { flex: 1; color: var(--fd); font-weight: 600; }
.cf-lab { display: flex; align-items: center; gap: 6px; }
.cf-charges { margin-left: auto; color: var(--fr); }
/* Diagnosis */
.cf-dxbox { padding: 3px 5px 4px 16px; }
.cf-dxhdr { position: relative; padding-left: 0; }
.cf-icdind { float: right; }
.cf-dxgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px 10px; margin-top: 3px; }
.cf-dx { color: var(--fd); font-weight: 600; font-size: 9px; border-bottom: 1px solid #e7cdc8; }
.cf-dx i { color: var(--fr); font-style: normal; font-weight: 800; }
/* Service lines */
.cf-svc { border: 1px solid var(--fr); border-top: none; }
.cf-svchead { display: flex; background: #f6d7d0; border-bottom: 1px solid var(--fr); font-size: 5.8px; font-weight: 700; }
.cf-svchead span, .cf-svcrow span { padding: 2px 3px; border-right: 1px solid #e7b7af; box-sizing: border-box; }
.cf-svchead span:last-child, .cf-svcrow span:last-child { border-right: none; }
.cf-svchead small { display: block; font-weight: 400; }
.cf-svcrow { display: flex; border-bottom: 1px solid #f0dedb; min-height: 21px; align-items: center; }
.cf-svcrow:nth-child(even) { background: #fcf3f1; }
.cf-svcrow span { color: var(--fd); font-weight: 600; font-size: 9px; }
.cf-svc .a { flex: 2.6; } .cf-svc .b { flex: .5; } .cf-svc .c { flex: .4; } .cf-svc .d { flex: 1.7; }
.cf-svc .e { flex: .5; } .cf-svc .f { flex: 1; text-align: right; } .cf-svc .g { flex: .5; }
.cf-svc .h { flex: .5; } .cf-svc .i { flex: .5; } .cf-svc .j { flex: 1.6; }
.cf-fromto { display: flex; gap: 4px; }
.cf-svcrow .d .cpt { font-weight: 700; } .cf-svcrow .d .mod { margin-left: 6px; color: #7a5a54; }
.cf-svcrow .i { font-size: 6px; color: var(--fr); font-weight: 700; }
.cf-svcrow .j em { color: #9a6a5a; font-size: 7px; font-style: italic; font-weight: 500; }
/* Facility / billing */
.cf-fac .cf-multi span { display: block; }
.cf-multi { line-height: 1.25; }
.cf-ph { display: inline; }
.cf-tiny { display: block; font-size: 5.6px; color: var(--fr); }
/* Footer */
.cf-foot { display: flex; justify-content: space-between; align-items: center; font-size: 6.4px; margin-top: 4px; }
.cf-foot .mid { font-style: italic; font-weight: 700; }
@media print {
  .hcfa-noprint, .bo-side, .bo-mobtabs, .tm-banner, .bo-brandrow { display: none !important; }
  body, .bo-main { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .cf-sheet { width: 100%; border: none; margin: 0 auto; break-after: page; page-break-after: always; }
  .cf-sheet:last-of-type { break-after: auto; page-break-after: auto; }
  @page { size: letter portrait; margin: 0.25in; }
}
`;
