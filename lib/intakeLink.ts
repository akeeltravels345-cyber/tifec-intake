// =============================================================================
// Bridge between the intake system and the billing client record. Matches a
// billing client (name + DOB) to their intake submission(s) so the two systems
// read as one. Returns only METADATA (form type, date, status, clinician) — the
// intake ANSWERS stay clinician-only, enforced by the submission view itself.
// =============================================================================

import { listSubmissions } from "./db";
import { decrypt } from "./crypto";
import { getClinician } from "./clinicians";
import { templateLabel, type FormTemplateKey } from "./forms";

export interface LinkedIntake {
  token: string;
  formLabel: string;
  clinicianId: string;
  clinicianName: string;
  createdAt: string;   // ISO
  status: string;
}

const norm = (s: string) => s.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");

/** Intake submissions that belong to this billing client, newest first.
 *  A match is an exact normalized name, or (when both carry a DOB) the same DOB
 *  plus a shared first/last name — so "Ada Rivers" and "Ada Sample-Rivers" still
 *  connect when the birth date agrees. */
export async function findIntakeForClient(first: string, last: string, dob?: string): Promise<LinkedIntake[]> {
  let rows;
  try { rows = await listSubmissions(); } catch { return []; }
  const target = norm(`${first} ${last}`);
  const firstN = norm(first), lastN = norm(last);
  const out: LinkedIntake[] = [];

  for (const r of rows) {
    let a: Record<string, unknown>;
    try { a = JSON.parse(decrypt(r.answers_encrypted)) as Record<string, unknown>; } catch { continue; }
    const names = [a.full_name, a.his_name, a.hers_name, a.consent_signature_name].filter(Boolean).map((n) => String(n));
    if (names.length === 0) continue;
    const subDob = a.dob ? String(a.dob) : undefined;

    const hit = names.some((n) => {
      const nn = norm(n);
      if (nn === target) return true;
      if (dob && subDob && dob === subDob && (nn.includes(lastN) || nn.includes(firstN))) return true;
      return false;
    });
    if (!hit) continue;

    out.push({
      token: r.token,
      formLabel: templateLabel((r.form_key || "individual") as FormTemplateKey),
      clinicianId: r.clinician_id,
      clinicianName: getClinician(r.clinician_id)?.name ?? r.clinician_id,
      createdAt: r.created_at,
      status: r.status,
    });
  }
  return out.sort((x, y) => y.createdAt.localeCompare(x.createdAt));
}
