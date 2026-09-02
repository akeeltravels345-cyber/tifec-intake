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
      // Postgres returns timestamps as Date objects; the JSON store returns
      // ISO strings. Normalise to an ISO string so the sort (.localeCompare)
      // and the UI (.slice) that consume this can't blow up on a Date.
      createdAt: r.created_at ? new Date(r.created_at as unknown as string | number | Date).toISOString() : "",
      status: r.status,
    });
  }
  return out.sort((x, y) => (y.createdAt || "").localeCompare(x.createdAt || ""));
}

const isEmail = (v: unknown): v is string => typeof v === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

/** The distinct contact email(s) found on this billing client's intake
 *  submission(s). On a couple form the email tied to the matched person is used
 *  (his_name -> his_email, hers_name -> hers_email); otherwise the form's own
 *  `email`. Returns every distinct address so the caller can tell a clean single
 *  match from an ambiguous one and never guess between conflicting addresses. */
export async function findIntakeEmailsForClient(first: string, last: string, dob?: string): Promise<string[]> {
  let rows;
  try { rows = await listSubmissions(); } catch { return []; }
  const target = norm(`${first} ${last}`);
  const firstN = norm(first), lastN = norm(last);
  const found = new Set<string>();

  for (const r of rows) {
    let a: Record<string, unknown>;
    try { a = JSON.parse(decrypt(r.answers_encrypted)) as Record<string, unknown>; } catch { continue; }
    const subDob = a.dob ? String(a.dob) : undefined;
    // Which person on this form is our client, and thus which email is theirs.
    const nameMatches = (n: unknown) => {
      if (!n) return false;
      const nn = norm(String(n));
      if (nn === target) return true;
      if (dob && subDob && dob === subDob && (nn.includes(lastN) || nn.includes(firstN))) return true;
      return false;
    };
    const candidates: unknown[] = [];
    if (nameMatches(a.his_name)) candidates.push(a.his_email);
    if (nameMatches(a.hers_name)) candidates.push(a.hers_email);
    if (nameMatches(a.full_name) || nameMatches(a.consent_signature_name)) candidates.push(a.email);
    for (const c of candidates) if (isEmail(c)) found.add(String(c).trim().toLowerCase());
  }
  return [...found];
}
