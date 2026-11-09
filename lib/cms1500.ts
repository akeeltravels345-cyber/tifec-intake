// =============================================================================
// CMS-1500 (08-05) claim building (pure, server-safe). Turns a client + their
// billable sessions into one or more claim "forms": one per payer, and — because
// the form holds only 6 service lines (box 24) — a fresh continuation form every
// 6 lines. Each CPT-code OCCURRENCE is its own service line with its own charge
// (a code billed three times prints three lines), matching a real submission.
// =============================================================================

import type { BillingSession, ProviderConfig } from "./billing";
import type { ClientProfile } from "./clients";

export const CMS_LINES_PER_FORM = 6;

/** ISO YYYY-MM-DD → MM/DD/YY as the form prints dates. */
export function mdy(iso?: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}/${m[3]}/${m[1].slice(2)}` : iso;
}
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ClaimLine {
  date: string;                  // MM/DD/YY (box 24A from = to)
  pos: string; cpt: string; mod: string; dxPointer: string;
  charge: number; units: number; renderingNpi: string; renderingName: string;
}
export interface Addr { street?: string; city?: string; state?: string; zip?: string }
export interface ClaimForm {
  key: string;
  payerName: string;
  carrierCode: string;           // box 11c-ish / header (e.g. "362")
  page: number; pages: number;   // "form 1 of 2" when a payer has >6 lines
  patientName: string; insuredName: string;
  dob?: string; sex?: string; relationship: string; insuredDob?: string; insuredSex?: string;
  memberId?: string; groupNo?: string; planName: string;
  address: string; phone?: string;
  patientAddr: Addr; insuredAddr: Addr; // box 5 / box 7, split for City/State/ZIP
  diagnosis: string[];           // box 21 A-L (ICD-10)
  lines: ClaimLine[];
  total: number; amountPaid: number; balanceDue: number;
  signature: string;             // box 31 — rendering provider on this form
}

export interface ClaimResolvers {
  insName: (id: string | null) => string;
  clinName: (id: string) => string;
  renderingNpi: (clinicianId: string) => string;
  cptFee: (code: string) => number;      // catalogue fee, to charge per code
  carrierCode?: (insurerId: string) => string; // optional payer code for box 10d
  /** How a payer is billed. When it returns "invoice", that payer's sessions are
   *  billed by invoice, not a CMS-1500, so they're excluded from claim forms. */
  billStyle?: (insurerId: string) => "claim" | "invoice";
}

/** Split a total charge across n lines so each line shows a per-unit amount and
 *  the lines still sum EXACTLY to the total (any rounding penny lands on the last
 *  line). */
function splitCharge(total: number, n: number): number[] {
  if (n <= 1) return [r2(total)];
  const per = r2(total / n);
  const out = Array<number>(n).fill(per);
  out[n - 1] = r2(total - per * (n - 1));
  return out;
}

/** Expand a session into ONE service line per CPT-code OCCURRENCE (so a code
 *  billed three times prints three separate lines, each units 1, each with its
 *  own charge), preserving the order the codes were entered. A session billed
 *  under a single code splits its total across those lines (honouring a chosen
 *  time/value total); a session mixing codes charges each occurrence that code's
 *  catalogue fee; a session with no codes (e.g. an imported balance) is one line
 *  at the session total. */
function sessionLines(s: BillingSession, r: ClaimResolvers, dxPointer: string): ClaimLine[] {
  const date = mdy(s.dateOfService);
  const npi = r.renderingNpi(s.clinicianId), name = r.clinName(s.clinicianId);
  const base = { date, pos: "11", mod: "", dxPointer, renderingNpi: npi, renderingName: name };
  const codes = (s.cptCodes ?? []).filter(Boolean);
  if (codes.length === 0) return [{ ...base, units: Math.max(1, Math.round(s.durationHours || 1)), cpt: "", charge: r2(s.totalCost) }];
  // One distinct code (possibly repeated): split the session total across each
  // occurrence, so 90791 x3 at $450 prints three 90791 lines of $150.
  if (new Set(codes).size === 1) {
    const charges = splitCharge(r2(s.totalCost), codes.length);
    return codes.map((code, i) => ({ ...base, units: 1, cpt: code, charge: charges[i] }));
  }
  // Mixed codes: each occurrence is its own line at that code's catalogue fee.
  return codes.map((code) => ({ ...base, units: 1, cpt: code, charge: r2(r.cptFee(code)) }));
}

/** Build every CMS-1500 form for one client from their billable (insured)
 *  sessions. Returns [] when there's nothing to claim. */
export function buildClaimForms(
  client: { first: string; last: string; profile: ClientProfile },
  sessions: BillingSession[],
  r: ClaimResolvers,
): ClaimForm[] {
  const p = client.profile;
  // Insured sessions only, and never invoice-style payers (they bill by invoice).
  const billable = sessions.filter((s) => s.insurerId && r.billStyle?.(s.insurerId) !== "invoice");
  if (billable.length === 0) return [];

  const patientName = `${client.last}, ${client.first}`;
  const selfInsured = !p.insurance?.relationship || p.insurance.relationship === "self";
  const insuredName = selfInsured
    ? patientName
    : `${p.insurance?.insuredLast ?? ""}, ${p.insurance?.insuredFirst ?? ""}`.replace(/^,\s*$/, "");
  const address = [
    [p.address?.line1, p.address?.line2].filter(Boolean).join(", "),
    [p.address?.city, p.address?.region, p.address?.postal].filter(Boolean).join(" "),
    p.address?.country,
  ].filter(Boolean).join(" · ");
  const dx = p.diagnosis ?? [];
  const dxPointer = dx.length ? "A" : ""; // 02/12 relates 24E to box 21 by letter A-L
  const patientAddr = { street: [p.address?.line1, p.address?.line2].filter(Boolean).join(" "), city: p.address?.city, state: p.address?.region, zip: p.address?.postal };
  const insuredAddr = selfInsured ? patientAddr : {};
  const insuredSex = selfInsured ? p.sex : undefined;

  // One payer at a time, in a stable order.
  const byPayer = new Map<string, BillingSession[]>();
  for (const s of billable) {
    const k = s.insurerId as string;
    if (!byPayer.has(k)) byPayer.set(k, []);
    byPayer.get(k)!.push(s);
  }

  const forms: ClaimForm[] = [];
  for (const [insurerId, group] of byPayer) {
    const sorted = [...group].sort((a, b) => a.dateOfService.localeCompare(b.dateOfService));
    // Expand every session to its per-code service lines first, THEN paginate by 6.
    const allLines = sorted.flatMap((s) => sessionLines(s, r, dxPointer));
    const pages = Math.max(1, Math.ceil(allLines.length / CMS_LINES_PER_FORM));
    const carrierCode = r.carrierCode?.(insurerId) ?? "";
    for (let page = 0; page < pages; page++) {
      const lines = allLines.slice(page * CMS_LINES_PER_FORM, (page + 1) * CMS_LINES_PER_FORM);
      const total = r2(lines.reduce((t, l) => t + l.charge, 0));
      forms.push({
        key: `${insurerId}-${page}`,
        payerName: r.insName(insurerId), carrierCode,
        page: page + 1, pages,
        patientName, insuredName,
        dob: mdy(p.dob), sex: p.sex, relationship: p.insurance?.relationship ?? "self",
        insuredDob: mdy(selfInsured ? p.dob : p.insurance?.insuredDob), insuredSex,
        memberId: p.insurance?.memberId, groupNo: p.insurance?.groupNo,
        planName: p.insurance?.planName || r.insName(insurerId),
        address, phone: p.phone, patientAddr, insuredAddr,
        diagnosis: dx,
        lines,
        total, amountPaid: 0, balanceDue: total,
        signature: lines[0] ? lines[0].renderingName : "",
      });
    }
  }
  return forms;
}

// ===========================================================================
// Claim naming + email subject. The attached PDF, the stored document, the
// "Save PDF" download and the email subject all read from here so they stay in
// lock-step with what the biller asked for:
//   PDF / default subject:  "LASTNAME, Firstname claim 29-30Dec26"
//   CINICO subject:         "Shion O'Connor #9361 LASTNAME, Firstname <MemberId> DOS DD-MM-YYYY"
// ===========================================================================

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Payer-specific subject prefixes — a provider identifier the payer requires at
// the very front of the subject. CINICO requires the credentialed provider line
// ("#9362" is the TIFEC/provider identifier, not the client's member ID; it
// comes from the biller's reference email). Keyed by upper-cased insurer name;
// add payers here as their rules arrive (or lift this into Setup later).
const CLAIM_SUBJECT_PREFIX: Record<string, string> = {
  CINICO: "Shion O'Connor #9362",
};

/** Distinct dates of service across every form, ascending. */
function claimServiceDates(forms: ClaimForm[]): { y: number; m: number; d: number }[] {
  const seen = new Set<string>();
  const out: { y: number; m: number; d: number }[] = [];
  for (const f of forms) for (const l of f.lines) {
    const mt = l.date.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
    if (!mt || seen.has(l.date)) continue;
    seen.add(l.date);
    out.push({ y: 2000 + Number(mt[3]), m: Number(mt[1]), d: Number(mt[2]) });
  }
  return out.sort((a, b) => a.y - b.y || a.m - b.m || a.d - b.d);
}

/** Compact DOS for the PDF / default subject, e.g. "29-30Dec26". Dates in one
 *  month+year collapse to "day-day-…Mon YY"; dates spanning months list each as
 *  its own "DMonYY" token. */
export function claimDosCompact(forms: ClaimForm[]): string {
  const ds = claimServiceDates(forms);
  if (ds.length === 0) return "";
  const yy = (y: number) => String(y).slice(2);
  const sameMY = ds.every((x) => x.m === ds[0].m && x.y === ds[0].y);
  if (sameMY) return `${ds.map((x) => x.d).join("-")}${MONTHS[ds[0].m - 1]}${yy(ds[0].y)}`;
  return ds.map((x) => `${x.d}${MONTHS[x.m - 1]}${yy(x.y)}`).join("-");
}

/** The attachment / document base name (no extension): "DELFOSSE, Skii claim 29-30Dec26". */
export function claimPdfBaseName(last: string, first: string, forms: ClaimForm[]): string {
  const dos = claimDosCompact(forms);
  return `${last.toUpperCase()}, ${first} claim${dos ? ` ${dos}` : ""}`.trim();
}

/** The email subject. Non-CINICO payers reuse the PDF name ("EBANKS, Kayla claim
 *  23Oct26"). CINICO gets the biller's exact format:
 *  "Shion O'Connor #9362 -CHISOLM, Lucille - 996007016-DOS 28Oct26". */
export function claimEmailSubject(opts: { last: string; first: string; memberId?: string; payerName: string; forms: ClaimForm[] }): string {
  const prefix = CLAIM_SUBJECT_PREFIX[(opts.payerName || "").trim().toUpperCase()];
  if (!prefix) return claimPdfBaseName(opts.last, opts.first, opts.forms);
  const member = opts.memberId?.trim();
  const dos = claimDosCompact(opts.forms);
  let subj = `${prefix} -${opts.last.toUpperCase()}, ${opts.first}`;
  if (member) subj += ` - ${member}`;
  if (dos) subj += `${member ? "" : " "}-DOS ${dos}`;
  return subj;
}
