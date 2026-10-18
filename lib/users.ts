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
import { encrypt, decrypt } from "./crypto";

export interface UserRow {
  clinician_id: string;
  password_hash: string;
  updated_at: string;
  tour_seen?: boolean; // the first-login walkthrough only auto-opens until this is set
  idle_minutes?: number; // per-user auto-logout window; unset = default (15)
  avatar?: string | null; // profile photo as a small square JPEG data URL (or null)
  mfa_enabled?: boolean; // two-step login turned on and confirmed
  mfa_secret?: string | null; // the TOTP secret, ENCRYPTED at rest (never plaintext)
  mfa_backup?: string[] | null; // unused backup codes, each one-way hashed
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

/** This clinician's profile photo (small square JPEG data URL), or null.
 *  Guarded so it works before the avatar column exists. */
export async function getAvatar(clinicianId: string): Promise<string | null> {
  if (usePostgres) {
    const sql = await pgClient();
    try {
      const res = (await sql`SELECT avatar FROM clinician_users WHERE clinician_id = ${clinicianId} LIMIT 1`) as { avatar: string | null }[];
      return res[0]?.avatar ?? null;
    } catch { return null; }
  }
  return readLocal().find((u) => u.clinician_id === clinicianId)?.avatar ?? null;
}

/** Profile photos for several clinicians at once, as a { id: dataUrl } map that
 *  only includes those who have one. One query; guarded like getAvatar. */
export async function getAvatars(clinicianIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(clinicianIds.filter(Boolean))];
  const out: Record<string, string> = {};
  if (ids.length === 0) return out;
  if (usePostgres) {
    const sql = await pgClient();
    try {
      const rows = (await sql`SELECT clinician_id, avatar FROM clinician_users WHERE clinician_id = ANY(${ids}) AND avatar IS NOT NULL`) as { clinician_id: string; avatar: string | null }[];
      for (const r of rows) if (r.avatar) out[r.clinician_id] = r.avatar;
    } catch { /* avatar column not migrated yet */ }
    return out;
  }
  for (const u of readLocal()) if (ids.includes(u.clinician_id) && u.avatar) out[u.clinician_id] = u.avatar;
  return out;
}

/** Set (data URL) or clear (null) this clinician's profile photo. */
export async function setAvatar(clinicianId: string, avatar: string | null): Promise<void> {
  if (usePostgres) {
    const sql = await pgClient();
    try {
      await sql`
        INSERT INTO clinician_users (clinician_id, password_hash, updated_at, avatar)
        VALUES (${clinicianId}, '', ${new Date().toISOString()}, ${avatar})
        ON CONFLICT (clinician_id) DO UPDATE SET avatar = ${avatar}`;
    } catch { /* column may not exist yet */ }
    return;
  }
  const rows = readLocal();
  const existing = rows.find((u) => u.clinician_id === clinicianId);
  if (existing) existing.avatar = avatar;
  else rows.push({ clinician_id: clinicianId, password_hash: "", updated_at: new Date().toISOString(), avatar });
  writeLocal(rows);
}

// ---------------------------------------------------------------------------
// Two-step login (MFA). The TOTP secret is stored ENCRYPTED (lib/crypto); backup
// codes are stored one-way hashed (lib/totp). Columns self-migrate on first use,
// and — like the other optional setters here — we never touch `updated_at` on a
// conflict, so turning two-step on/off does NOT invalidate the user's session.
// ---------------------------------------------------------------------------
let mfaColsEnsured = false;
async function ensureMfaColumns(sql: Awaited<ReturnType<typeof pgClient>>): Promise<void> {
  if (mfaColsEnsured) return;
  try {
    await sql`ALTER TABLE clinician_users ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false`;
    await sql`ALTER TABLE clinician_users ADD COLUMN IF NOT EXISTS mfa_secret text`;
    await sql`ALTER TABLE clinician_users ADD COLUMN IF NOT EXISTS mfa_backup jsonb`;
    mfaColsEnsured = true;
  } catch { /* no perms / already exists — reads are guarded anyway */ }
}

function normBackup(v: unknown): string[] {
  const raw = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return []; } })() : v;
  return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
}

export interface MfaState { enabled: boolean; backupRemaining: number }

/** Whether two-step login is on for this clinician, and how many backup codes
 *  remain. Guarded so it returns "off" cleanly before the columns exist. */
export async function getMfaState(clinicianId: string): Promise<MfaState> {
  if (usePostgres) {
    const sql = await pgClient();
    try {
      const res = (await sql`SELECT mfa_enabled, mfa_backup FROM clinician_users WHERE clinician_id = ${clinicianId} LIMIT 1`) as { mfa_enabled: boolean | null; mfa_backup: unknown }[];
      return { enabled: !!res[0]?.mfa_enabled, backupRemaining: normBackup(res[0]?.mfa_backup).length };
    } catch { return { enabled: false, backupRemaining: 0 }; }
  }
  const u = readLocal().find((r) => r.clinician_id === clinicianId);
  return { enabled: !!u?.mfa_enabled, backupRemaining: normBackup(u?.mfa_backup).length };
}

/** The decrypted TOTP secret (base32), or null. Used only server-side at the
 *  verify and enable steps — never sent to the browser once enrolled. */
export async function getMfaSecret(clinicianId: string): Promise<string | null> {
  let enc: string | null = null;
  if (usePostgres) {
    const sql = await pgClient();
    try {
      const res = (await sql`SELECT mfa_secret FROM clinician_users WHERE clinician_id = ${clinicianId} LIMIT 1`) as { mfa_secret: string | null }[];
      enc = res[0]?.mfa_secret ?? null;
    } catch { return null; }
  } else {
    enc = readLocal().find((r) => r.clinician_id === clinicianId)?.mfa_secret ?? null;
  }
  if (!enc) return null;
  try { return decrypt(enc); } catch { return null; }
}

/** Store a freshly generated (still unconfirmed) TOTP secret, encrypted. Leaves
 *  mfa_enabled false until the user proves they can produce a code. */
export async function setMfaPendingSecret(clinicianId: string, secretPlain: string): Promise<void> {
  const enc = encrypt(secretPlain);
  if (usePostgres) {
    const sql = await pgClient();
    await ensureMfaColumns(sql);
    try {
      await sql`UPDATE clinician_users SET mfa_secret = ${enc}, mfa_enabled = false, mfa_backup = NULL WHERE clinician_id = ${clinicianId}`;
    } catch { /* columns not present */ }
    return;
  }
  const rows = readLocal();
  const u = rows.find((r) => r.clinician_id === clinicianId);
  if (u) { u.mfa_secret = enc; u.mfa_enabled = false; u.mfa_backup = null; writeLocal(rows); }
}

/** Confirm two-step login: mark enabled and store the hashed backup codes. */
export async function enableMfa(clinicianId: string, backupHashes: string[]): Promise<void> {
  if (usePostgres) {
    const sql = await pgClient();
    await ensureMfaColumns(sql);
    try {
      await sql`UPDATE clinician_users SET mfa_enabled = true, mfa_backup = ${JSON.stringify(backupHashes)}::jsonb WHERE clinician_id = ${clinicianId}`;
    } catch { /* columns not present */ }
    return;
  }
  const rows = readLocal();
  const u = rows.find((r) => r.clinician_id === clinicianId);
  if (u) { u.mfa_enabled = true; u.mfa_backup = backupHashes; writeLocal(rows); }
}

/** Turn two-step login off and forget the secret + backup codes entirely. */
export async function disableMfa(clinicianId: string): Promise<void> {
  if (usePostgres) {
    const sql = await pgClient();
    await ensureMfaColumns(sql);
    try {
      await sql`UPDATE clinician_users SET mfa_enabled = false, mfa_secret = NULL, mfa_backup = NULL WHERE clinician_id = ${clinicianId}`;
    } catch { /* columns not present */ }
    return;
  }
  const rows = readLocal();
  const u = rows.find((r) => r.clinician_id === clinicianId);
  if (u) { u.mfa_enabled = false; u.mfa_secret = null; u.mfa_backup = null; writeLocal(rows); }
}

/** The stored (hashed) backup codes, for verification at login. */
export async function getBackupHashes(clinicianId: string): Promise<string[]> {
  if (usePostgres) {
    const sql = await pgClient();
    try {
      const res = (await sql`SELECT mfa_backup FROM clinician_users WHERE clinician_id = ${clinicianId} LIMIT 1`) as { mfa_backup: unknown }[];
      return normBackup(res[0]?.mfa_backup);
    } catch { return []; }
  }
  return normBackup(readLocal().find((r) => r.clinician_id === clinicianId)?.mfa_backup);
}

/** Remove one used backup code (by its stored hash), so it can't be reused. */
export async function removeBackupHash(clinicianId: string, hash: string): Promise<void> {
  const remaining = (await getBackupHashes(clinicianId)).filter((h) => h !== hash);
  if (usePostgres) {
    const sql = await pgClient();
    await ensureMfaColumns(sql);
    try { await sql`UPDATE clinician_users SET mfa_backup = ${JSON.stringify(remaining)}::jsonb WHERE clinician_id = ${clinicianId}`; } catch { /* columns not present */ }
    return;
  }
  const rows = readLocal();
  const u = rows.find((r) => r.clinician_id === clinicianId);
  if (u) { u.mfa_backup = remaining; writeLocal(rows); }
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
