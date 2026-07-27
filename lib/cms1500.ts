// =============================================================================
// CMS-1500 claim building (pure, server-safe). Turns a client + their billable
// sessions into one or more claim "forms": one per payer, and — because a real
// CMS-1500 holds only 6 service lines (box 24, rows 1-6) — a fresh continuation
// form every 6 lines. Each service line carries its own date of service.
// =============================================================================

import type { BillingSession, ProviderConfig } from "./billing";
import type { ClientProfile } from "./clients";

export const CMS_LINES_PER_FORM = 6;

export interface ClaimLine {
  date: string; pos: string; cpt: string; mod: string; dxPointer: string;
  charge: number; units: number; renderingNpi: string; renderingName: string;
}
export interface ClaimForm {
  key: string;
  payerName: string;
  page: number; pages: number;          // "form 1 of 2" when a payer has >6 lines
  patientName: string; insuredName: string;
  dob?: string; sex?: string; relationship: string; insuredDob?: string;
  memberId?: string; groupNo?: string; planName: string;
  address: string; phone?: string;
  diagnosis: string[];
  lines: ClaimLine[]; total: number;
  signature: string;                     // box 31 — rendering provider on this form
}

export interface ClaimResolvers {
  insName: (id: string | null) => string;
  clinName: (id: string) => string;
  renderingNpi: (clinicianId: string) => string;
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
    const pages = Math.max(1, Math.ceil(sorted.length / CMS_LINES_PER_FORM));
    for (let page = 0; page < pages; page++) {
      const slice = sorted.slice(page * CMS_LINES_PER_FORM, (page + 1) * CMS_LINES_PER_FORM);
      const lines: ClaimLine[] = slice.map((s) => ({
        date: s.dateOfService, pos: "11", cpt: s.cptCodes.join(", "), mod: "",
        dxPointer: dx.length ? "A" : "",
        charge: s.totalCost, units: Math.max(1, Math.round(s.durationHours || 1)),
        renderingNpi: r.renderingNpi(s.clinicianId), renderingName: r.clinName(s.clinicianId),
      }));
      forms.push({
        key: `${insurerId}-${page}`,
        payerName: r.insName(insurerId),
        page: page + 1, pages,
        patientName, insuredName,
        dob: p.dob, sex: p.sex, relationship: p.insurance?.relationship ?? "self",
        insuredDob: selfInsured ? p.dob : p.insurance?.insuredDob,
        memberId: p.insurance?.memberId, groupNo: p.insurance?.groupNo,
        planName: p.insurance?.planName || r.insName(insurerId),
        address, phone: p.phone,
        diagnosis: dx,
        lines, total: Math.round(slice.reduce((t, s) => t + s.totalCost, 0) * 100) / 100,
        signature: slice[0] ? r.clinName(slice[0].clinicianId) : "",
      });
    }
  }
  return forms;
}
