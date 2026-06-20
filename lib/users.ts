// Clinician login credentials store (password hashes).
//
//  • Production: Postgres (DATABASE_URL) - table `clinician_users`.
//  • Local dev: encrypted-at-rest not needed for hashes; stored in
//    data/users.local.json. Hashes are scrypt (see lib/auth.ts), never plaintext.
//
// A clinician's identity (id, name, email) lives in lib/clinicians.ts; this
// store only holds the secret needed to log in, keyed by clinician id.

import fs from "fs";
import path from "path";

export interface UserRow {
  clinician_id: string;
  password_hash: string;
  updated_at: string;
}

const usePostgres = !!process.env.DATABASE_URL;

async function pgClient() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.DATABASE_URL as string);
}

const LOCAL_FILE = path.join(process.cwd(), "data", "users.local.json");

function readLocal(): UserRow[] {
  try {
    return JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeLocal(rows: UserRow[]) {
  fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(rows, null, 2));
}

export async function getUser(clinicianId: string): Promise<UserRow | null> {
  if (usePostgres) {
    const sql = await pgClient();
    const res = (await sql`SELECT * FROM clinician_users WHERE clinician_id = ${clinicianId} LIMIT 1`) as UserRow[];
    return res[0] ?? null;
  }
  return readLocal().find((u) => u.clinician_id === clinicianId) ?? null;
}

/** Create or update a clinician's password hash. */
export async function setUserPassword(clinicianId: string, passwordHash: string): Promise<void> {
  const now = new Date().toISOString();
  if (usePostgres) {
    const sql = await pgClient();
    await sql`
      INSERT INTO clinician_users (clinician_id, password_hash, updated_at)
      VALUES (${clinicianId}, ${passwordHash}, ${now})
      ON CONFLICT (clinician_id)
      DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = EXCLUDED.updated_at
    `;
    return;
  }
  const rows = readLocal();
  const existing = rows.find((u) => u.clinician_id === clinicianId);
  if (existing) {
    existing.password_hash = passwordHash;
    existing.updated_at = now;
  } else {
    rows.push({ clinician_id: clinicianId, password_hash: passwordHash, updated_at: now });
  }
  writeLocal(rows);
}

/** Which clinicians already have a login set (for the admin page). */
export async function listUserIds(): Promise<string[]> {
  if (usePostgres) {
    const sql = await pgClient();
    const res = (await sql`SELECT clinician_id FROM clinician_users`) as { clinician_id: string }[];
    return res.map((r) => r.clinician_id);
  }
  return readLocal().map((u) => u.clinician_id);
}
