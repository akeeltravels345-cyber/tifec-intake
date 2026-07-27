// =============================================================================
// Client records (ADDITIVE) — PRACTICE-LEVEL. One row per real person, shared
// across the whole practice: the SAME client can be seen by several clinicians.
//
//   • Production: Neon Postgres (DATABASE_URL), billing_clients +
//     billing_client_clinicians tables.
//   • Local dev:  data/billing-clients.local.json + data/billing-client-links.local.json.
//
// Identity is NAME + DATE OF BIRTH, so one person is one record even across
// clinicians. All PHI (name, DOB, address, insurance, diagnosis) is AES-encrypted
// at rest; two blind indexes let us match without ever storing plaintext:
//   • identityKey = keyed hash of "first last | dob"  → the practice-wide identity
//   • nameKey     = keyed hash of "first last"        → name-only lookups / merge
//
// Isolation is preserved by the link table: a clinician's roster is the clients
// linked to them; only the biller/owner calls listAllClients().
// =============================================================================

import fs from "fs";
import path from "path";
import { encrypt, decrypt, randomId, blindIndex } from "./crypto";

/** Everything a CMS-1500 claim needs beyond the name. All optional so a record
 *  can start sparse (a name from an import) and be filled in over time. */
export interface ClientProfile {
  dob?: string;                 // YYYY-MM-DD (1500 box 3)
  sex?: "M" | "F" | "U";        // box 3
  address?: {
    line1?: string; line2?: string; city?: string; region?: string; postal?: string; country?: string;
  };                            // box 5
  phone?: string;               // box 5
  insurance?: {
    memberId?: string;          // insured's ID number (box 1a)
    groupNo?: string;           // box 11
    planName?: string;          // box 11c
    relationship?: "self" | "spouse" | "child" | "other"; // box 6
    insuredFirst?: string;      // box 4 (when the insured isn't the patient)
    insuredLast?: string;
    insuredDob?: string;        // box 11a
  };
  diagnosis?: string[];         // ICD-10 codes (box 21) — the client's standing dx
}

export interface Client {
  id: string;
  first: string;
  last: string;
  insurerId: string | null;     // usual insurer (prefilled when logging)
  clinicianIds: string[];       // which clinicians see this client
  profile: ClientProfile;
  createdAt: string;
}

const usePostgres = !!process.env.DATABASE_URL;
async function pg() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.DATABASE_URL as string);
}
const dir = (f: string) => path.join(process.cwd(), "data", f);
const FILE = "billing-clients.local.json";
const LINK_FILE = "billing-client-links.local.json";
function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(dir(file), "utf8")) as T; } catch { return fallback; }
}
function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(dir(file)), { recursive: true });
  fs.writeFileSync(dir(file), JSON.stringify(data, null, 2));
}

interface StoredClient { id: string; nameEnc: string; nameKey: string; identityKey: string; insurerId: string | null; profileEnc: string | null; createdAt: string }
interface StoredLink { clientId: string; clinicianId: string; createdAt: string }

const str = (v: unknown) => (v == null ? "" : String(v));
const normName = (first: string, last: string) => `${first} ${last}`.trim();
export const nameKeyOf = (first: string, last: string) => blindIndex(normName(first, last));
/** Practice identity: name + DOB. With no DOB it collapses to the name key, so a
 *  name-only record and blindIndex(name) share a value and can be reconciled. */
export const identityKeyOf = (first: string, last: string, dob?: string) =>
  dob ? blindIndex(`${normName(first, last)}|${dob.trim()}`) : nameKeyOf(first, last);

function decodeName(nameEnc: string): { first: string; last: string } {
  try { return JSON.parse(decrypt(nameEnc)); } catch { return { first: "[unreadable]", last: "" }; }
}
function decodeProfile(profileEnc: string | null): ClientProfile {
  if (!profileEnc) return {};
  try { return JSON.parse(decrypt(profileEnc)) as ClientProfile; } catch { return {}; }
}
const encodeProfile = (p: ClientProfile): string | null =>
  p && Object.keys(p).length ? encrypt(JSON.stringify(p)) : null;

// ---------------------------------------------------------------------------
// Link helpers (which clinicians see which clients)
// ---------------------------------------------------------------------------
async function clinicianIdsFor(clientIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (clientIds.length === 0) return out;
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`SELECT client_id, clinician_id FROM billing_client_clinicians WHERE client_id = ANY(${clientIds})`) as Record<string, unknown>[];
    for (const r of rows) (out.get(str(r.client_id)) ?? out.set(str(r.client_id), []).get(str(r.client_id))!)!.push(str(r.clinician_id));
    return out;
  }
  for (const l of readJson<StoredLink[]>(LINK_FILE, [])) {
    if (!clientIds.includes(l.clientId)) continue;
    (out.get(l.clientId) ?? out.set(l.clientId, []).get(l.clientId)!)!.push(l.clinicianId);
  }
  return out;
}

function rowToClient(c: StoredClient, clinicianIds: string[]): Client {
  const { first, last } = decodeName(c.nameEnc);
  return { id: c.id, first, last, insurerId: c.insurerId, clinicianIds, profile: decodeProfile(c.profileEnc), createdAt: c.createdAt };
}

async function loadStoredClients(): Promise<StoredClient[]> {
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`SELECT id, name_enc, name_key, identity_key, insurer_id, profile_enc, created_at FROM billing_clients ORDER BY created_at DESC`) as Record<string, unknown>[];
    return rows.map((r) => ({ id: str(r.id), nameEnc: str(r.name_enc), nameKey: str(r.name_key), identityKey: str(r.identity_key), insurerId: r.insurer_id ? str(r.insurer_id) : null, profileEnc: r.profile_enc ? str(r.profile_enc) : null, createdAt: str(r.created_at) }));
  }
  return readJson<StoredClient[]>(FILE, []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** A clinician's own roster — only clients linked to them. */
export async function listClients(clinicianId: string): Promise<Client[]> {
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`
      SELECT c.id, c.name_enc, c.name_key, c.identity_key, c.insurer_id, c.profile_enc, c.created_at
      FROM billing_clients c
      JOIN billing_client_clinicians l ON l.client_id = c.id
      WHERE l.clinician_id = ${clinicianId}
      ORDER BY c.created_at DESC`) as Record<string, unknown>[];
    const stored = rows.map((r) => ({ id: str(r.id), nameEnc: str(r.name_enc), nameKey: str(r.name_key), identityKey: str(r.identity_key), insurerId: r.insurer_id ? str(r.insurer_id) : null, profileEnc: r.profile_enc ? str(r.profile_enc) : null, createdAt: str(r.created_at) }));
    return stored.map((c) => rowToClient(c, [clinicianId]));
  }
  const links = readJson<StoredLink[]>(LINK_FILE, []).filter((l) => l.clinicianId === clinicianId);
  const ids = new Set(links.map((l) => l.clientId));
  return (await loadStoredClients()).filter((c) => ids.has(c.id)).map((c) => rowToClient(c, [clinicianId]));
}

/** Every client in the practice — biller/owner only. Carries each client's
 *  full set of clinicians so the caller can show who they're seen by. */
export async function listAllClients(): Promise<Client[]> {
  const stored = await loadStoredClients();
  const byClient = await clinicianIdsFor(stored.map((c) => c.id));
  return stored.map((c) => rowToClient(c, byClient.get(c.id) ?? []));
}

/** One client by id, with its clinicians. No access check here — callers gate. */
export async function getClient(id: string): Promise<Client | null> {
  const stored = (await loadStoredClients()).find((c) => c.id === id);
  if (!stored) return null;
  const byClient = await clinicianIdsFor([id]);
  return rowToClient(stored, byClient.get(id) ?? []);
}

/** True if a clinician is linked to a client (for isolation checks). */
export async function clinicianSeesClient(clientId: string, clinicianId: string): Promise<boolean> {
  const map = await clinicianIdsFor([clientId]);
  return (map.get(clientId) ?? []).includes(clinicianId);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function insertLink(clientId: string, clinicianId: string) {
  const createdAt = new Date().toISOString();
  if (usePostgres) {
    const sql = await pg();
    await sql`INSERT INTO billing_client_clinicians (client_id, clinician_id, created_at) VALUES (${clientId}, ${clinicianId}, ${createdAt}) ON CONFLICT DO NOTHING`;
    return;
  }
  const links = readJson<StoredLink[]>(LINK_FILE, []);
  if (links.some((l) => l.clientId === clientId && l.clinicianId === clinicianId)) return;
  links.push({ clientId, clinicianId, createdAt });
  writeJson(LINK_FILE, links);
}

async function insertClient(c: StoredClient) {
  if (usePostgres) {
    const sql = await pg();
    await sql`INSERT INTO billing_clients (id, name_enc, name_key, identity_key, insurer_id, profile_enc, created_at)
      VALUES (${c.id}, ${c.nameEnc}, ${c.nameKey}, ${c.identityKey}, ${c.insurerId}, ${c.profileEnc}, ${c.createdAt})`;
    return;
  }
  writeJson(FILE, [...readJson<StoredClient[]>(FILE, []), c]);
}

async function saveClientFields(id: string, insurerId: string | null, identityKey: string, profileEnc: string | null) {
  if (usePostgres) {
    const sql = await pg();
    await sql`UPDATE billing_clients SET insurer_id = ${insurerId}, identity_key = ${identityKey}, profile_enc = ${profileEnc} WHERE id = ${id}`;
    return;
  }
  const all = readJson<StoredClient[]>(FILE, []);
  const s = all.find((x) => x.id === id);
  if (!s) return;
  s.insurerId = insurerId; s.identityKey = identityKey; s.profileEnc = profileEnc;
  writeJson(FILE, all);
}

/** Merge two profiles, keeping existing non-empty values and filling gaps from
 *  the incoming one (so a later import can enrich a sparse record). */
function mergeProfile(existing: ClientProfile, incoming: ClientProfile): ClientProfile {
  const out: ClientProfile = { ...incoming, ...existing };
  if (incoming.address || existing.address) out.address = { ...incoming.address, ...existing.address };
  if (incoming.insurance || existing.insurance) out.insurance = { ...incoming.insurance, ...existing.insurance };
  if (existing.diagnosis?.length) out.diagnosis = existing.diagnosis;
  else if (incoming.diagnosis?.length) out.diagnosis = incoming.diagnosis;
  return out;
}

export interface ClientInput {
  first: string;
  last: string;
  insurerId: string | null;
  profile?: ClientProfile;
}

interface EnsureResult { client: StoredClient; created: boolean; linked: boolean }

/** Find-or-create a practice-level client by NAME + DOB, then make sure the
 *  clinician is linked to them. Enriches a sparse existing record (e.g. a
 *  name-only import) when new details arrive. The heart of dedup. */
async function ensureClient(clinicianId: string, input: ClientInput, all: StoredClient[]): Promise<EnsureResult> {
  const first = input.first.trim(), last = input.last.trim();
  const profile = input.profile ?? {};
  const dob = profile.dob?.trim() || undefined;
  const nk = nameKeyOf(first, last);
  const idk = identityKeyOf(first, last, dob);

  // Candidates: same name across the practice.
  const sameName = all.filter((c) => c.nameKey === nk);
  let match =
    sameName.find((c) => c.identityKey === idk) ||           // exact name+DOB (or name-only) hit
    (dob ? sameName.find((c) => c.identityKey === nk) : undefined) || // a name-only stub to upgrade with this DOB
    (!dob && sameName.length ? sameName[0] : undefined);     // no DOB given: fold into the one on file

  if (match) {
    // Enrich: fill the usual insurer + any missing profile fields; upgrade a
    // name-only stub's identity once we learn the DOB.
    const merged = mergeProfile(decodeProfile(match.profileEnc), profile);
    const newInsurer = match.insurerId ?? input.insurerId;
    const newIdentity = merged.dob ? identityKeyOf(first, last, merged.dob) : match.identityKey;
    const changed = newInsurer !== match.insurerId || newIdentity !== match.identityKey || JSON.stringify(merged) !== JSON.stringify(decodeProfile(match.profileEnc));
    if (changed) {
      match.insurerId = newInsurer; match.identityKey = newIdentity; match.profileEnc = encodeProfile(merged);
      await saveClientFields(match.id, newInsurer, newIdentity, match.profileEnc);
    }
    const linked = !(await clinicianSeesClient(match.id, clinicianId));
    if (linked) await insertLink(match.id, clinicianId);
    return { client: match, created: false, linked };
  }

  const created: StoredClient = {
    id: randomId(), nameEnc: encrypt(JSON.stringify({ first, last })), nameKey: nk, identityKey: idk,
    insurerId: input.insurerId, profileEnc: encodeProfile(profile), createdAt: new Date().toISOString(),
  };
  await insertClient(created);
  await insertLink(created.id, clinicianId);
  all.push(created);
  return { client: created, created: true, linked: true };
}

/** Public: find-or-create one client and link the clinician. Returns the id to
 *  stamp on a session. Used when logging a session for someone. */
export async function resolveClient(clinicianId: string, input: ClientInput): Promise<string> {
  const all = await loadStoredClients();
  const { client } = await ensureClient(clinicianId, input, all);
  return client.id;
}

/** Bulk add (from an import). Practice-level dedup: an existing person is reused
 *  (and linked to this clinician) rather than duplicated. */
export async function addClients(
  clinicianId: string,
  people: ClientInput[],
): Promise<{ added: number; linked: number; duplicates: number; ids: (string | null)[] }> {
  const all = await loadStoredClients();
  let added = 0, linked = 0, duplicates = 0;
  // ids[i] corresponds to people[i] (null for an empty/skipped row) so callers
  // can map each input row to the client record it resolved to.
  const ids: (string | null)[] = [];
  for (const p of people) {
    if (!p.first.trim() && !p.last.trim()) { ids.push(null); continue; }
    const res = await ensureClient(clinicianId, p, all);
    ids.push(res.client.id);
    if (res.created) added++;
    else if (res.linked) linked++;
    else duplicates++;
  }
  return { added, linked, duplicates, ids };
}

/** Edit a client's usual insurer + profile (biller/clinician editing a record). */
export async function updateClient(id: string, insurerId: string | null, profile: ClientProfile): Promise<Client | null> {
  const all = await loadStoredClients();
  const c = all.find((x) => x.id === id);
  if (!c) return null;
  const { first, last } = decodeName(c.nameEnc);
  const identityKey = identityKeyOf(first, last, profile.dob?.trim() || undefined);
  const profileEnc = encodeProfile(profile);
  await saveClientFields(id, insurerId, identityKey, profileEnc);
  return getClient(id);
}
