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
  const billable = sessions.filter((s) => s.insurerId);
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
