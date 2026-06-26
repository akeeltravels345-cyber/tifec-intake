// Pluggable storage layer.
//
//  • In production set DATABASE_URL to your Neon Postgres connection string and
//    this module uses Neon. Run the SQL in db/schema.sql once to create the table.
//  • In local development (no DATABASE_URL) it falls back to an encrypted JSON
//    file at data/submissions.local.json so you can run the whole app with no
//    database setup. The fallback is NOT for production use.
//
// Either way, the `answers` column holds the AES-256-GCM ciphertext produced by
// lib/crypto.ts - plaintext PHI is never persisted.

import fs from "fs";
import path from "path";
import { randomId } from "./crypto";

export type SubmissionStatus = "new" | "reviewed" | "archived";

export interface SubmissionRow {
  id: string;
  clinician_id: string;
  token: string;
  form_key: string; // which intake form was used (e.g. "individual" | "couples")
  couple_id: string | null; // links the two partners of a couple (null otherwise)
  answers_encrypted: string; // ciphertext of JSON answers
  created_at: string; // ISO timestamp
  status: SubmissionStatus;
  notes_encrypted: string | null; // ciphertext of clinician's private notes (may be null/empty)
}

/** Older rows may predate the status/notes/form_key/couple columns; fill defaults. */
function normalize(row: SubmissionRow): SubmissionRow {
  return {
    ...row,
    status: (row.status as SubmissionStatus) || "new",
    notes_encrypted: row.notes_encrypted ?? null,
    form_key: row.form_key || "",
    couple_id: row.couple_id ?? null,
  };
}

const usePostgres = !!process.env.DATABASE_URL;

// ---------------------------------------------------------------------------
// Postgres (Neon) implementation
// ---------------------------------------------------------------------------
async function pgClient() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.DATABASE_URL as string);
}

// ---------------------------------------------------------------------------
// Local JSON-file fallback (dev only)
// ---------------------------------------------------------------------------
const LOCAL_FILE = path.join(process.cwd(), "data", "submissions.local.json");

function readLocal(): SubmissionRow[] {
  try {
    return JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeLocal(rows: SubmissionRow[]) {
  fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(rows, null, 2));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function insertSubmission(row: SubmissionRow): Promise<void> {
  if (usePostgres) {
    const sql = await pgClient();
    await sql`
      INSERT INTO submissions (id, clinician_id, token, form_key, couple_id, answers_encrypted, created_at, status, notes_encrypted)
      VALUES (${row.id}, ${row.clinician_id}, ${row.token}, ${row.form_key}, ${row.couple_id}, ${row.answers_encrypted}, ${row.created_at}, ${row.status}, ${row.notes_encrypted})
    `;
    return;
  }
  const rows = readLocal();
  rows.push(row);
  writeLocal(rows);
}

export async function getSubmissionByToken(token: string): Promise<SubmissionRow | null> {
  if (usePostgres) {
    const sql = await pgClient();
    const res = (await sql`SELECT * FROM submissions WHERE token = ${token} LIMIT 1`) as SubmissionRow[];
    return res[0] ? normalize(res[0]) : null;
  }
  const row = readLocal().find((r) => r.token === token);
  return row ? normalize(row) : null;
}

export async function getSubmissionsByClinician(clinicianId: string): Promise<SubmissionRow[]> {
  if (usePostgres) {
    const sql = await pgClient();
    const res = (await sql`
      SELECT * FROM submissions WHERE clinician_id = ${clinicianId} ORDER BY created_at DESC
    `) as SubmissionRow[];
    return res.map(normalize);
  }
  return readLocal()
    .filter((r) => r.clinician_id === clinicianId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(normalize);
}

/** All submissions belonging to one couple (same clinician + couple_id). */
export async function getCoupleSubmissions(clinicianId: string, coupleId: string): Promise<SubmissionRow[]> {
  if (usePostgres) {
    const sql = await pgClient();
    const res = (await sql`
      SELECT * FROM submissions WHERE clinician_id = ${clinicianId} AND couple_id = ${coupleId} ORDER BY created_at ASC
    `) as SubmissionRow[];
    return res.map(normalize);
  }
  return readLocal()
    .filter((r) => r.clinician_id === clinicianId && r.couple_id === coupleId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(normalize);
}

// In the guards below, `clinicianId === null` means an admin override (no
// ownership filter); a string means the action is scoped to that clinician.
function owns(row: SubmissionRow, clinicianId: string | null): boolean {
  return clinicianId === null || row.clinician_id === clinicianId;
}

/** Update status - scoped to `clinicianId`, or any submission when null (admin). */
export async function updateSubmissionStatus(
  token: string,
  clinicianId: string | null,
  status: SubmissionStatus
): Promise<boolean> {
  if (usePostgres) {
    const sql = await pgClient();
    const res = (await (clinicianId === null
      ? sql`UPDATE submissions SET status = ${status} WHERE token = ${token} RETURNING id`
      : sql`UPDATE submissions SET status = ${status} WHERE token = ${token} AND clinician_id = ${clinicianId} RETURNING id`)) as { id: string }[];
    return res.length > 0;
  }
  const rows = readLocal();
  const row = rows.find((r) => r.token === token && owns(r, clinicianId));
  if (!row) return false;
  row.status = status;
  writeLocal(rows);
  return true;
}

/** Save private notes (already encrypted) - scoped to `clinicianId`, or any when null (admin). */
export async function updateSubmissionNotes(
  token: string,
  clinicianId: string | null,
  notesEncrypted: string | null
): Promise<boolean> {
  if (usePostgres) {
    const sql = await pgClient();
    const res = (await (clinicianId === null
      ? sql`UPDATE submissions SET notes_encrypted = ${notesEncrypted} WHERE token = ${token} RETURNING id`
      : sql`UPDATE submissions SET notes_encrypted = ${notesEncrypted} WHERE token = ${token} AND clinician_id = ${clinicianId} RETURNING id`)) as { id: string }[];
    return res.length > 0;
  }
  const rows = readLocal();
  const row = rows.find((r) => r.token === token && owns(r, clinicianId));
  if (!row) return false;
  row.notes_encrypted = notesEncrypted;
  writeLocal(rows);
  return true;
}

/** Overwrite a submission's encrypted answers (clinician correcting an error) - scoped to the owner. */
export async function updateSubmissionAnswers(
  token: string,
  clinicianId: string | null,
  answersEncrypted: string
): Promise<boolean> {
  if (usePostgres) {
    const sql = await pgClient();
    const res = (await (clinicianId === null
      ? sql`UPDATE submissions SET answers_encrypted = ${answersEncrypted} WHERE token = ${token} RETURNING id`
      : sql`UPDATE submissions SET answers_encrypted = ${answersEncrypted} WHERE token = ${token} AND clinician_id = ${clinicianId} RETURNING id`)) as { id: string }[];
    return res.length > 0;
  }
  const rows = readLocal();
  const row = rows.find((r) => r.token === token && owns(r, clinicianId));
  if (!row) return false;
  row.answers_encrypted = answersEncrypted;
  writeLocal(rows);
  return true;
}

/** Permanently delete a submission - scoped to `clinicianId`, or any when null (admin). */
export async function deleteSubmission(token: string, clinicianId: string | null): Promise<boolean> {
  if (usePostgres) {
    const sql = await pgClient();
    const res = (await (clinicianId === null
      ? sql`DELETE FROM submissions WHERE token = ${token} RETURNING id`
      : sql`DELETE FROM submissions WHERE token = ${token} AND clinician_id = ${clinicianId} RETURNING id`)) as { id: string }[];
    return res.length > 0;
  }
  const rows = readLocal();
  const idx = rows.findIndex((r) => r.token === token && owns(r, clinicianId));
  if (idx === -1) return false;
  rows.splice(idx, 1);
  writeLocal(rows);
  return true;
}

export async function listSubmissions(): Promise<SubmissionRow[]> {
  if (usePostgres) {
    const sql = await pgClient();
    const res = (await sql`SELECT * FROM submissions ORDER BY created_at DESC`) as SubmissionRow[];
    return res.map(normalize);
  }
  return readLocal()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(normalize);
}

// ---------------------------------------------------------------------------
// Access audit log (HIPAA): record who viewed/changed which submission.
// No PHI is stored here - only the submission token + action + timestamp.
// ---------------------------------------------------------------------------
export type AuditAction =
  | "view"
  | "status"
  | "notes"
  | "edit"
  | "delete"
  | "login"
  | "login_failed"
  | "logout"
  | "password";

export interface AuditEntry {
  id: string;
  clinician_id: string;
  submission_token: string;
  action: AuditAction;
  detail: string;
  at: string; // ISO
}

const AUDIT_FILE = path.join(process.cwd(), "data", "access_log.local.json");

export async function logAccess(entry: AuditEntry): Promise<void> {
  try {
    if (usePostgres) {
      const sql = await pgClient();
      await sql`
        INSERT INTO access_log (id, clinician_id, submission_token, action, detail, at)
        VALUES (${entry.id}, ${entry.clinician_id}, ${entry.submission_token}, ${entry.action}, ${entry.detail}, ${entry.at})
      `;
      return;
    }
    let rows: AuditEntry[] = [];
    try {
      rows = JSON.parse(fs.readFileSync(AUDIT_FILE, "utf8"));
    } catch {
      rows = [];
    }
    rows.push(entry);
    fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(rows, null, 2));
  } catch (err) {
    // Audit logging must never break the user-facing action.
    console.error("audit log failed:", err);
  }
}

/**
 * Record an authentication event (login/logout/password). There is no
 * submission involved, so submission_token is stored empty. Never store the
 * raw password or unknown attacker-supplied emails here.
 */
export async function logAuth(
  clinicianId: string,
  action: Extract<AuditAction, "login" | "login_failed" | "logout" | "password">,
  detail: string
): Promise<void> {
  await logAccess({
    id: randomId(),
    clinician_id: clinicianId,
    submission_token: "",
    action,
    detail,
    at: new Date().toISOString(),
  });
}

/** Delete audit entries older than `maxAgeDays` (data-retention / DPA). Returns count removed. */
export async function pruneAccessLog(maxAgeDays = 730): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();
  try {
    if (usePostgres) {
      const sql = await pgClient();
      const res = (await sql`DELETE FROM access_log WHERE at < ${cutoff} RETURNING id`) as { id: string }[];
      return res.length;
    }
    let rows: AuditEntry[] = [];
    try {
      rows = JSON.parse(fs.readFileSync(AUDIT_FILE, "utf8"));
    } catch {
      return 0;
    }
    const kept = rows.filter((r) => r.at >= cutoff);
    if (kept.length !== rows.length) {
      fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
      fs.writeFileSync(AUDIT_FILE, JSON.stringify(kept, null, 2));
    }
    return rows.length - kept.length;
  } catch (err) {
    console.error("prune access log failed:", err);
    return 0;
  }
}

/** Most recent audit-log entries (admin oversight). */
export async function listAccessLog(limit = 50): Promise<AuditEntry[]> {
  if (usePostgres) {
    const sql = await pgClient();
    return (await sql`SELECT * FROM access_log ORDER BY at DESC LIMIT ${limit}`) as AuditEntry[];
  }
  try {
    const rows: AuditEntry[] = JSON.parse(fs.readFileSync(AUDIT_FILE, "utf8"));
    return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  } catch {
    return [];
  }
}
