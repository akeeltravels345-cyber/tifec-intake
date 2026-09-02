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
  tour_seen?: boolean; // the first-login walkthrough only auto-opens until this is set
  idle_minutes?: number; // per-user auto-logout window; unset = default (15)
}

// Auto-logout window choices (minutes). Capped so it can be relaxed for a
// power user without removing the HIPAA automatic-logoff safeguard entirely.
export const IDLE_MINUTES_DEFAULT = 15;
export const IDLE_MINUTES_CHOICES = [15, 30, 60] as const;
export const clampIdleMinutes = (n: unknown): number => {
  const v = Number(n);
  return (IDLE_MINUTES_CHOICES as readonly number[]).includes(v) ? v : IDLE_MINUTES_DEFAULT;
};

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

/** Has this clinician already seen the first-login walkthrough? */
export async function getTourSeen(clinicianId: string): Promise<boolean> {
  if (usePostgres) {
    const sql = await pgClient();
    try {
      const res = (await sql`SELECT tour_seen FROM clinician_users WHERE clinician_id = ${clinicianId} LIMIT 1`) as { tour_seen: boolean }[];
      return !!res[0]?.tour_seen;
    } catch {
      return false; // column may not exist yet - treat as not seen
    }
  }
  return !!readLocal().find((u) => u.clinician_id === clinicianId)?.tour_seen;
}

/** Mark the walkthrough as seen so it never auto-opens again for this account. */
export async function markTourSeen(clinicianId: string): Promise<void> {
  if (usePostgres) {
    const sql = await pgClient();
    await sql`
      INSERT INTO clinician_users (clinician_id, password_hash, updated_at, tour_seen)
      VALUES (${clinicianId}, '', ${new Date().toISOString()}, true)
      ON CONFLICT (clinician_id) DO UPDATE SET tour_seen = true`;
    return;
  }
  const rows = readLocal();
  const existing = rows.find((u) => u.clinician_id === clinicianId);
  if (existing) existing.tour_seen = true;
  else rows.push({ clinician_id: clinicianId, password_hash: "", updated_at: new Date().toISOString(), tour_seen: true });
  writeLocal(rows);
}

/** This clinician's auto-logout window in minutes (default 15). Guarded so it
 *  works before the idle_minutes column exists — falls back to the default. */
export async function getIdleMinutes(clinicianId: string): Promise<number> {
  if (usePostgres) {
    const sql = await pgClient();
    try {
      const res = (await sql`SELECT idle_minutes FROM clinician_users WHERE clinician_id = ${clinicianId} LIMIT 1`) as { idle_minutes: number | null }[];
      return res[0]?.idle_minutes ? clampIdleMinutes(res[0].idle_minutes) : IDLE_MINUTES_DEFAULT;
    } catch {
      return IDLE_MINUTES_DEFAULT; // column may not exist yet
    }
  }
  const v = readLocal().find((u) => u.clinician_id === clinicianId)?.idle_minutes;
  return v ? clampIdleMinutes(v) : IDLE_MINUTES_DEFAULT;
}

/** Set this clinician's auto-logout window (clamped to an allowed choice). */
export async function setIdleMinutes(clinicianId: string, minutes: number): Promise<void> {
  const m = clampIdleMinutes(minutes);
  if (usePostgres) {
    const sql = await pgClient();
    try {
      await sql`
        INSERT INTO clinician_users (clinician_id, password_hash, updated_at, idle_minutes)
        VALUES (${clinicianId}, '', ${new Date().toISOString()}, ${m})
        ON CONFLICT (clinician_id) DO UPDATE SET idle_minutes = ${m}`;
    } catch { /* column may not exist yet — nothing to persist until the migration runs */ }
    return;
  }
  const rows = readLocal();
  const existing = rows.find((u) => u.clinician_id === clinicianId);
  if (existing) existing.idle_minutes = m;
  else rows.push({ clinician_id: clinicianId, password_hash: "", updated_at: new Date().toISOString(), idle_minutes: m });
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
