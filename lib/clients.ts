// =============================================================================
// Client roster (ADDITIVE). A persistent list of each clinician's clients, so a
// client can be picked when logging a session even before their first one is
// logged in this system — e.g. imported from a practice's existing records.
//
//   • Production: Neon Postgres (DATABASE_URL), billing_clients table.
//   • Local dev:  data/billing-clients.local.json (gitignored).
//
// Client names are PHI, so they're AES-encrypted at rest exactly like intake
// answers and session client names. To dedup without storing the name in
// plaintext, each row also carries a blind index (keyed hash) of the name —
// deterministic, so "same client" can be matched, but useless without the key.
// Every query is scoped to one clinician: a clinician never sees another's list.
// =============================================================================

import fs from "fs";
import path from "path";
import { encrypt, decrypt, randomId, blindIndex } from "./crypto";

export interface Client {
  id: string;
  clinicianId: string;
  first: string;
  last: string;
  insurerId: string | null; // their usual insurer (prefilled when logging)
  createdAt: string;
}

const usePostgres = !!process.env.DATABASE_URL;
async function pg() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.DATABASE_URL as string);
}
const dir = (f: string) => path.join(process.cwd(), "data", f);
const FILE = "billing-clients.local.json";
function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(dir(file), "utf8")) as T; } catch { return fallback; }
}
function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(dir(file)), { recursive: true });
  fs.writeFileSync(dir(file), JSON.stringify(data, null, 2));
}

interface StoredClient { id: string; clinicianId: string; nameEnc: string; nameKey: string; insurerId: string | null; createdAt: string }

const str = (v: unknown) => (v == null ? "" : String(v));
const clientKey = (first: string, last: string) => blindIndex(`${first} ${last}`);
function decode(nameEnc: string): { first: string; last: string } {
  try { return JSON.parse(decrypt(nameEnc)); } catch { return { first: "[unreadable]", last: "" }; }
}

export async function listClients(clinicianId: string): Promise<Client[]> {
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`
      SELECT id, clinician_id, name_enc, insurer_id, created_at
      FROM billing_clients WHERE clinician_id = ${clinicianId} ORDER BY created_at DESC`) as Record<string, unknown>[];
    return rows.map((r) => {
      const { first, last } = decode(str(r.name_enc));
      return { id: str(r.id), clinicianId: str(r.clinician_id), first, last, insurerId: r.insurer_id ? str(r.insurer_id) : null, createdAt: str(r.created_at) };
    });
  }
  return readJson<StoredClient[]>(FILE, [])
    .filter((c) => c.clinicianId === clinicianId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((c) => { const { first, last } = decode(c.nameEnc); return { id: c.id, clinicianId: c.clinicianId, first, last, insurerId: c.insurerId, createdAt: c.createdAt }; });
}

/** Blind-index keys already on this clinician's roster, for dedup. */
export async function existingKeys(clinicianId: string): Promise<Set<string>> {
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`SELECT name_key FROM billing_clients WHERE clinician_id = ${clinicianId}`) as Record<string, unknown>[];
    return new Set(rows.map((r) => str(r.name_key)));
  }
  return new Set(readJson<StoredClient[]>(FILE, []).filter((c) => c.clinicianId === clinicianId).map((c) => c.nameKey));
}

/** Add clients to a clinician's roster, skipping any already there (matched by
 *  the blind index). Returns how many were actually added vs already present. */
export async function addClients(
  clinicianId: string,
  people: { first: string; last: string; insurerId: string | null }[],
): Promise<{ added: number; duplicates: number }> {
  const have = await existingKeys(clinicianId);
  const now = new Date().toISOString();
  let added = 0, duplicates = 0;
  const seenThisBatch = new Set<string>();
  const toWrite: StoredClient[] = [];

  for (const p of people) {
    const first = p.first.trim(), last = p.last.trim();
    if (!first && !last) continue;
    const key = clientKey(first, last);
    if (have.has(key) || seenThisBatch.has(key)) { duplicates++; continue; }
    seenThisBatch.add(key);
    toWrite.push({ id: randomId(), clinicianId, nameEnc: encrypt(JSON.stringify({ first, last })), nameKey: key, insurerId: p.insurerId, createdAt: now });
    added++;
  }
  if (toWrite.length === 0) return { added, duplicates };

  if (usePostgres) {
    const sql = await pg();
    for (const c of toWrite) {
      await sql`
        INSERT INTO billing_clients (id, clinician_id, name_enc, name_key, insurer_id, created_at)
        VALUES (${c.id}, ${c.clinicianId}, ${c.nameEnc}, ${c.nameKey}, ${c.insurerId}, ${c.createdAt})`;
    }
  } else {
    writeJson(FILE, [...readJson<StoredClient[]>(FILE, []), ...toWrite]);
  }
  return { added, duplicates };
}
