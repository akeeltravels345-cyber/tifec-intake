import type { ClaimForm } from "@/lib/cms1500";
import { OFFICIAL_CSS } from "./Cms1500OfficialForm";

// A faithful facsimile of the OLDER CMS-1500 (08-05) edition, OMB-0938-0999 —
// the version Practice Perfect produces and that CINICO accepts. Built to be an
// exact duplicate of Practice Perfect's output: same boxes, same spacing, numeric
// diagnosis pointers, a Balance Due line (box 30), and the "here" placeholders in
// the provider-identifier boxes when those aren't configured, exactly as Practice
// Perfect prints them. Populated from the same ClaimForm as the 02-12 form.

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const Box = ({ on }: { on?: boolean }) => <span className="cf-box">{on ? "X" : ""}</span>;

/** "MM/DD/YY" -> "MM DD YY" (spaced, plain), the way Practice Perfect prints dates. */
const spaced = (v?: string) => {
  const m = (v ?? "").match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : "";
};
/** Diagnosis pointer as a NUMBER (08-05), converting a letter pointer (A->1). */
const dxNum = (p?: string) => {
  if (!p) return "";
  const i = "ABCDEFGHIJKL".indexOf(p.toUpperCase());
  return i >= 0 ? String(i + 1) : p;
};

export default function Cms1500Official0805({ f, provider, legalName = "The Institute for Essential Care Ltd" }: {
  f: ClaimForm;
  provider: { practiceName?: string; npi?: string; ein?: string; phone?: string; addressLine1?: string; addressLine2?: string; city?: string; region?: string; postal?: string; country?: string };
  legalName?: string;
}) {
  const lines = [...f.lines];
  while (lines.length < 6) lines.push(null as unknown as (typeof f.lines)[number]);

  // Billing / facility block uses the practice's LEGAL entity name on claims.
  const addr1 = [provider.addressLine1, provider.addressLine2].filter(Boolean).join(" ");
  const cityzip = [provider.city, provider.region, provider.postal].filter(Boolean).join("  ");
  const facility = [legalName, addr1, cityzip].filter(Boolean);

  // Provider identifiers: show the real value where set, else "here" — the exact
  // placeholder Practice Perfect prints when a field hasn't been configured.
  const taxId = provider.ein || "here";
  const npi = provider.npi || "here";
  const sig = f.signature || "here";
  const today = new Date().toLocaleDateString("en-US", { year: "2-digit", month: "2-digit", day: "2-digit" });

  return (
    <div className="cf-sheet cf-0805">
      <span className="cf-edge carrier">CARRIER</span>
      <span className="cf-edge patient">PATIENT AND INSURED INFORMATION</span>
      <span className="cf-edge phys">PHYSICIAN OR SUPPLIER INFORMATION</span>

      {/* Carrier block — Practice Perfect prints the payer name/code at the top */}
      <div className="cf-carriertop">{f.payerName}{f.carrierCode ? ` (# ${f.carrierCode})` : ""}</div>

      {/* Header */}
      <div className="cf-head">
        <div className="cf-headL"><span className="cf-1500">1500</span></div>
        <div className="cf-headC">
          <div className="cf-title">HEALTH INSURANCE CLAIM FORM</div>
          <div className="cf-sub">APPROVED BY NATIONAL UNIFORM CLAIM COMMITTEE 08/05</div>
        </div>
        <div className="cf-headR"><span className="cf-picabox" /><span className="cf-picabox" /><span className="b">PICA</span></div>
      </div>

      {/* Row 1: program checkboxes | 1a insured id */}
      <div className="cf-row">
        <div className="cf-c f2">
          <div className="n">1.</div>
          <div className="cf-progs">
            <span>MEDICARE <Box /></span><span>MEDICAID <Box /></span><span>TRICARE<br />CHAMPUS <Box /></span>
            <span>CHAMPVA <Box /></span><span>GROUP<br />HEALTH PLAN <Box /></span><span>FECA<br />BLK LUNG <Box /></span><span>OTHER <Box on /></span>
          </div>
        </div>
        <div className="cf-c f1"><div className="n">1a.</div>INSURED&apos;S I.D. NUMBER<div className="v">{f.memberId}</div></div>
      </div>

      {/* 2 patient | 3 dob/sex | 4 insured */}
      <div className="cf-row">
        <div className="cf-c f2"><div className="n">2.</div>PATIENT&apos;S NAME (Last Name, First Name, Middle Initial)<div className="v">{f.patientName}</div></div>
        <div className="cf-c f1"><div className="n">3.</div>PATIENT&apos;S BIRTH DATE<span className="r">SEX</span>
          <div className="v cf-dobsex"><span className="cf-dmy">{spaced(f.dob)}</span><span className="cf-sexes">M <Box on={f.sex === "M"} /> F <Box on={f.sex === "F"} /></span></div>
        </div>
        <div className="cf-c f1"><div className="n">4.</div>INSURED&apos;S NAME (Last Name, First Name, Middle Initial)<div className="v">{f.insuredName}</div></div>
      </div>

      {/* 5 patient address | 6 relationship / 8 PATIENT STATUS | 7 insured address */}
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
          <div className="cf-midbot cf-ptstatus"><div className="n">8.</div>PATIENT STATUS
            <div className="v cf-rel">Single <Box /> Married <Box /> Other <Box on /></div>
            <div className="v cf-rel cf-emp">Employed <Box /> Full-Time Student <Box /> Part-Time Student <Box /></div>
          </div>
        </div>
        <div className="cf-c f1 cf-addr">
          <div className="cf-addrtop"><div className="n">7.</div>INSURED&apos;S ADDRESS (No., Street)<div className="v">{f.insuredAddr.street}</div></div>
          <div className="cf-addrsub"><span className="cf-lbl">CITY<div className="v">{f.insuredAddr.city}</div></span><span className="cf-lbl st">STATE<div className="v">{f.insuredAddr.state}</div></span></div>
          <div className="cf-addrsub"><span className="cf-lbl">ZIP CODE<div className="v">{f.insuredAddr.zip}</div></span><span className="cf-lbl tel">TELEPHONE (Include Area Code)<div className="v"></div></span></div>
        </div>
      </div>

      {/* 9 other insured | 10 condition | 11 insured policy (08-05 labels) */}
      <div className="cf-row cf-cond3">
        <div className="cf-c f2 cf-stack">
          <div className="cf-s"><div className="n">9.</div>OTHER INSURED&apos;S NAME (Last Name, First Name, Middle Initial)<div className="v"></div></div>
          <div className="cf-s"><div className="n">a.</div>OTHER INSURED&apos;S POLICY OR GROUP NUMBER<div className="v"></div></div>
          <div className="cf-s"><div className="n">b.</div>OTHER INSURED&apos;S DATE OF BIRTH<span className="r">SEX M <Box /> F <Box /></span></div>
          <div className="cf-s"><div className="n">c.</div>EMPLOYER&apos;S NAME OR SCHOOL NAME<div className="v"></div></div>
          <div className="cf-s"><div className="n">d.</div>INSURANCE PLAN NAME OR PROGRAM NAME<div className="v"></div></div>
        </div>
        <div className="cf-c f1 cf-stack">
          <div className="cf-s cf-condhdr"><div className="n">10.</div>IS PATIENT&apos;S CONDITION RELATED TO:</div>
          <div className="cf-s cf-yn"><span>a. EMPLOYMENT? (Current or Previous)</span><span className="yn">YES <Box /> NO <Box on /></span></div>
          <div className="cf-s cf-yn"><span>b. AUTO ACCIDENT?</span><span className="yn">YES <Box /> NO <Box on /></span></div>
          <div className="cf-s cf-yn"><span>c. OTHER ACCIDENT?</span><span className="yn">YES <Box /> NO <Box on /></span></div>
          <div className="cf-s"><div className="n">10d.</div>RESERVED FOR LOCAL USE<div className="v">{f.carrierCode ? `# ${f.carrierCode}` : ""}</div></div>
        </div>
        <div className="cf-c f1 cf-stack">
          <div className="cf-s"><div className="n">11.</div>INSURED&apos;S POLICY GROUP OR FECA NUMBER<div className="v">{f.groupNo}</div></div>
          <div className="cf-s cf-yn"><span>a. INSURED&apos;S DATE OF BIRTH</span><span className="yn"><span className="cf-dmy">{spaced(f.insuredDob)}</span> M <Box on={f.insuredSex === "M"} /> F <Box on={f.insuredSex === "F"} /></span></div>
          <div className="cf-s"><div className="n">b.</div>EMPLOYER&apos;S NAME OR SCHOOL NAME<div className="v"></div></div>
          <div className="cf-s"><div className="n">c.</div>INSURANCE PLAN NAME OR PROGRAM NAME<div className="v">{f.planName}</div></div>
          <div className="cf-s cf-yn"><span>d. IS THERE ANOTHER HEALTH BENEFIT PLAN?</span><span className="yn">YES <Box /> NO <Box on /></span></div>
        </div>
      </div>

      {/* 12 / 13 signatures */}
      <div className="cf-row">
        <div className="cf-c f2"><div className="n">12.</div>PATIENT&apos;S OR AUTHORIZED PERSON&apos;S SIGNATURE<div className="v sig">SIGNATURE ON FILE<span className="cf-sigdate">DATE</span></div></div>
        <div className="cf-c f2"><div className="n">13.</div>INSURED&apos;S OR AUTHORIZED PERSON&apos;S SIGNATURE<div className="v sig">SIGNATURE ON FILE</div></div>
      </div>

      {/* 14-16 (08-05 labels) */}
      <div className="cf-row">
        <div className="cf-c f1"><div className="n">14.</div>DATE OF CURRENT ILLNESS, INJURY OR PREGNANCY (LMP)<div className="v"></div></div>
        <div className="cf-c f1"><div className="n">15.</div>IF PATIENT HAS HAD SAME OR SIMILAR ILLNESS. GIVE FIRST DATE<div className="v"></div></div>
        <div className="cf-c f1"><div className="n">16.</div>DATES PATIENT UNABLE TO WORK IN CURRENT OCCUPATION<div className="v"></div></div>
      </div>
      {/* 17-18 */}
      <div className="cf-row">
        <div className="cf-c f2"><div className="n">17.</div>NAME OF REFERRING PROVIDER OR OTHER SOURCE<div className="v"></div>
          <div className="cf-npisub"><span>17a.</span><span>17b. NPI</span></div>
        </div>
        <div className="cf-c f2"><div className="n">18.</div>HOSPITALIZATION DATES RELATED TO CURRENT SERVICES<div className="v"></div></div>
      </div>
      {/* 19-20 (08-05: 19 reserved for local use) */}
      <div className="cf-row">
        <div className="cf-c f2"><div className="n">19.</div>RESERVED FOR LOCAL USE<div className="v"></div></div>
        <div className="cf-c f1"><div className="n">20.</div>OUTSIDE LAB?<div className="v cf-lab">YES <Box /> NO <Box on /><span className="cf-charges">$ CHARGES</span></div></div>
      </div>
      {/* 21-23 (08-05: four NUMBERED diagnosis positions, no ICD indicator) */}
      <div className="cf-row cf-cond3">
        <div className="cf-c f2 cf-dxbox">
          <div className="cf-dxhdr"><div className="n">21.</div>DIAGNOSIS OR NATURE OF ILLNESS OR INJURY (Relate Items 1, 2, 3 or 4 to Item 24E by Line)</div>
          <div className="cf-dx4">
            {[0, 1, 2, 3].map((i) => <span key={i} className="cf-dx"><i>{i + 1}.</i> {f.diagnosis[i] ?? ""}</span>)}
          </div>
        </div>
        <div className="cf-c f1 cf-stack">
          <div className="cf-s"><div className="n">22.</div>MEDICAID RESUBMISSION CODE / ORIGINAL REF. NO.<div className="v"></div></div>
          <div className="cf-s"><div className="n">23.</div>PRIOR AUTHORIZATION NUMBER<div className="v"></div></div>
        </div>
      </div>

      {/* Box 24 service lines (08-05: numeric DX pointer, spaced dates) */}
      <div className="cf-svc">
        <div className="cf-svchead">
          <span className="a">24. A. DATE(S) OF SERVICE<small>From &nbsp;&nbsp; To</small></span>
          <span className="b">B.<small>PLACE OF SERVICE</small></span>
          <span className="c">C.<small>EMG</small></span>
          <span className="d">D. PROCEDURES, SERVICES, OR SUPPLIES<small>CPT/HCPCS &nbsp; MODIFIER</small></span>
          <span className="e">E.<small>DIAGNOSIS POINTER</small></span>
          <span className="f">F.<small>$ CHARGES</small></span>
          <span className="g">G.<small>DAYS OR UNITS</small></span>
          <span className="h">H.<small>EPSDT Family Plan</small></span>
          <span className="i">I.<small>ID QUAL.</small></span>
          <span className="j">J.<small>RENDERING PROVIDER ID. #</small></span>
        </div>
        {lines.map((l, i) => (
          <div className="cf-svcrow" key={i}>
            <span className="a">{l ? <span className="cf-fromto"><span className="cf-dmy">{spaced(l.date)}</span><span className="cf-dmy">{spaced(l.date)}</span></span> : ""}</span>
            <span className="b">{l?.pos ?? ""}</span>
            <span className="c"></span>
            <span className="d"><span className="cpt">{l?.cpt ?? ""}</span><span className="mod">{l?.mod ?? ""}</span></span>
            <span className="e">{l ? dxNum(l.dxPointer) : ""}</span>
            <span className="f">{l ? money(l.charge) : ""}</span>
            <span className="g">{l?.units ?? ""}</span>
            <span className="h"></span>
            <span className="i">{l ? "NPI" : ""}</span>
            <span className="j">{l ? (l.renderingNpi || "") : ""}</span>
          </div>
        ))}
      </div>

      {/* 25-30 (08-05: box 30 is BALANCE DUE) */}
      <div className="cf-row">
        <div className="cf-c f1"><div className="n">25.</div>FEDERAL TAX I.D. NUMBER<span className="r">SSN <Box /> EIN <Box on /></span><div className="v">{taxId}</div></div>
        <div className="cf-c f1"><div className="n">26.</div>PATIENT&apos;S ACCOUNT NO.<div className="v"></div></div>
        <div className="cf-c f1"><div className="n">27.</div>ACCEPT ASSIGNMENT?<div className="v cf-rel">YES <Box on /> NO <Box /></div></div>
        <div className="cf-c f1"><div className="n">28.</div>TOTAL CHARGE<div className="v">$ {money(f.total)}</div></div>
        <div className="cf-c f1"><div className="n">29.</div>AMOUNT PAID<div className="v">$ {money(f.amountPaid)}</div></div>
        <div className="cf-c f1"><div className="n">30.</div>BALANCE DUE<div className="v">$ {money(f.balanceDue)}</div></div>
      </div>

      {/* 31-33 */}
      <div className="cf-row cf-last">
        <div className="cf-c f1"><div className="n">31.</div>SIGNATURE OF PHYSICIAN OR SUPPLIER<span className="cf-tiny">INCLUDING DEGREES OR CREDENTIALS</span><div className="v sig">{sig}<span className="cf-sigdate">{today}</span></div></div>
        <div className="cf-c f1 cf-fac"><div className="n">32.</div>SERVICE FACILITY LOCATION INFORMATION<div className="v cf-multi">{facility.map((x, k) => <span key={k}>{x}</span>)}</div>
          <div className="cf-npisub"><span>a. {npi}</span><span>b.</span></div>
        </div>
        <div className="cf-c f1 cf-fac"><div className="n">33.</div>BILLING PROVIDER INFO &amp; PH# <span className="v cf-ph">{provider.phone}</span><div className="v cf-multi">{facility.map((x, k) => <span key={k}>{x}</span>)}</div>
          <div className="cf-npisub"><span>a. {npi}</span><span>b.</span></div>
        </div>
      </div>

      <div className="cf-foot">
        <span>NUCC Instruction Manual available at: www.nucc.org</span>
        <span className="mid">PLEASE PRINT OR TYPE</span>
        <span>APPROVED OMB-0938-0999 FORM CMS-1500 (08-05)</span>
      </div>
    </div>
  );
}

export const OFFICIAL_0805_CSS = OFFICIAL_CSS + `
/* ---- 08-05 edition specifics ---- */
.cf-0805 .cf-carriertop { text-align: center; color: var(--fd); font-weight: 600; font-size: 9px; margin: 0 0 3px; }
.cf-0805 .cf-headL { min-width: 120px; }
.cf-1500 { display: inline-block; border: 1.5px solid var(--fr); border-radius: 3px; padding: 0 7px; font-family: Georgia, "Times New Roman", serif; font-weight: 800; font-size: 13px; letter-spacing: 2px; color: var(--fr); }
.cf-dmy { color: var(--fd); font-size: 9px; font-weight: 600; letter-spacing: 1px; white-space: nowrap; }
.cf-ptstatus .cf-rel { margin-top: 1px; }
.cf-ptstatus .cf-emp { font-size: 5.6px; }
.cf-ptstatus .cf-emp .cf-box { width: 8px; height: 8px; }
/* box 21: four numbered positions in a 2x2 grid */
.cf-dx4 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; margin-top: 4px; }
.cf-dx4 .cf-dx { color: var(--fd); font-weight: 600; font-size: 9px; border-bottom: 1px solid #e7cdc8; }
.cf-dx4 .cf-dx i { color: var(--fr); font-style: normal; font-weight: 800; margin-right: 3px; }
`;
