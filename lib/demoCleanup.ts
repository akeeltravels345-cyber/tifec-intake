// =============================================================================
// Demo-data cleanup helpers (admin tool).
//
// SAFETY: the admin role is deliberately PHI-free. This module therefore only
// ever exposes submissions whose client name carries the DEMO marker, so real
// client records can never be listed, shown, or deleted through the admin
// cleanup screen. Both the page AND the delete API use `isDemoRow` so the
// check cannot be bypassed by posting arbitrary tokens.
// =============================================================================

import { listSubmissions, getSubmissionByToken, type SubmissionRow } from "./db";
import { decrypt } from "./crypto";
import { getClinician } from "./clinicians";
import { templateLabel, type FormTemplateKey } from "./forms";

/** Seeded demo/test clients are named with this suffix, e.g. "Alicia Grant (DEMO)". */
export const DEMO_MARKER = "(DEMO)";

/** Client display name from an encrypted row, or null if it can't be read. */
function nameOf(row: SubmissionRow): string | null {
  try {
    const a = JSON.parse(decrypt(row.answers_encrypted)) as Record<string, string>;
    const couple = [a.his_name, a.hers_name].filter(Boolean).join(" & ");
    return a.full_name || couple || a.consent_signature_name || null;
  } catch {
    return null;
  }
}

/** True only for clearly-marked demo records. Everything else is treated as real PHI. */
export function isDemoRow(row: SubmissionRow): boolean {
  const n = nameOf(row);
  return !!n && n.toUpperCase().includes(DEMO_MARKER);
}

export interface DemoRecord {
  token: string;
  clinicianId: string;
  clinicianName: string;
  formKey: string;
  formLabel: string;
  name: string;
  createdAt: string;
  status: string;
  isCouple: boolean;
}

/** Every demo record across the practice, newest first. Never returns real clients. */
export async function listDemoRecords(): Promise<DemoRecord[]> {
  const rows = await listSubmissions();
  const out: DemoRecord[] = [];
  for (const r of rows) {
    if (!isDemoRow(r)) continue;
    const key = (r.form_key || "individual") as FormTemplateKey;
    out.push({
      token: r.token,
      clinicianId: r.clinician_id,
      clinicianName: getClinician(r.clinician_id)?.name ?? r.clinician_id,
      formKey: key,
      formLabel: templateLabel(key),
      name: nameOf(r) ?? "(unreadable)",
      createdAt: r.created_at,
      status: r.status,
      isCouple: !!r.couple_id,
    });
  }
  return out;
}

/** Re-checks server-side that a token really is a demo record before deleting it. */
export async function isDemoToken(token: string): Promise<boolean> {
  const row = await getSubmissionByToken(token);
  return !!row && isDemoRow(row);
}
