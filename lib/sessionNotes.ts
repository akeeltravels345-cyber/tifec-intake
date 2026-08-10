// Clinical session notes (SOAP), encrypted at rest. Dual-mode: Postgres in prod,
// a gitignored JSON file in local dev. The body holds { s, o, a, p } as encrypted
// JSON — only clinicians linked to the client see it (access is enforced by the
// API/pages, never here).
import fs from "fs";
import path from "path";
import { encrypt, decrypt, randomId } from "./crypto";

// Feature flag: session notes are hidden unless NOTES_ENABLED=1. Flip the env
// var (or this default) to bring the feature back — nothing else changes.
export const NOTES_ENABLED = process.env.NOTES_ENABLED === "1";

export interface Soap { s: string; o: string; a: string; p: string }
export interface SessionNote {
  id: string;
  clientId: string;
  clinicianId: string;   // author
  sessionId: string | null;
  noteDate: string;      // YYYY-MM-DD
  soap: Soap;
  createdAt: string;
  updatedAt: string;
}

const usePostgres = !!process.env.DATABASE_URL;
async function pg() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.DATABASE_URL as string);
}
const LOCAL_FILE = path.join(process.cwd(), "data", "session-notes.local.json");
interface StoredNote { id: string; clientId: string; clinicianId: string; sessionId: string | null; noteDate: string; bodyEnc: string; createdAt: string; updatedAt: string }
function readLocal(): StoredNote[] {
  try { return JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8")); } catch { return []; }
}
function writeLocal(rows: StoredNote[]) {
  fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(rows, null, 2));
}

function decodeSoap(enc: string): Soap {
  try {
    const o = JSON.parse(decrypt(enc)) as Partial<Soap>;
    return { s: o.s || "", o: o.o || "", a: o.a || "", p: o.p || "" };
  } catch {
    return { s: "", o: "", a: "", p: "" };
  }
}
const encodeSoap = (soap: Soap) => encrypt(JSON.stringify({ s: soap.s || "", o: soap.o || "", a: soap.a || "", p: soap.p || "" }));

function toNote(r: StoredNote): SessionNote {
  return { id: r.id, clientId: r.clientId, clinicianId: r.clinicianId, sessionId: r.sessionId ?? null, noteDate: r.noteDate, soap: decodeSoap(r.bodyEnc), createdAt: r.createdAt, updatedAt: r.updatedAt };
}
function rowToStored(r: Record<string, unknown>): StoredNote {
  return { id: String(r.id), clientId: String(r.client_id), clinicianId: String(r.clinician_id), sessionId: (r.session_id as string) ?? null, noteDate: String(r.note_date), bodyEnc: String(r.body_enc), createdAt: String(r.created_at), updatedAt: String(r.updated_at) };
}

/** Notes for one client (newest first). Access is the caller's responsibility. */
export async function listNotesForClient(clientId: string): Promise<SessionNote[]> {
  try {
    if (usePostgres) {
      const sql = await pg();
      const rows = (await sql`SELECT * FROM session_notes WHERE client_id = ${clientId} ORDER BY note_date DESC, created_at DESC`) as Record<string, unknown>[];
      return rows.map(rowToStored).map(toNote);
    }
    return readLocal().filter((r) => r.clientId === clientId).sort((a, b) => b.noteDate.localeCompare(a.noteDate) || b.createdAt.localeCompare(a.createdAt)).map(toNote);
  } catch { return []; }
}

/** Notes across many clients (for the dedicated Notes area). */
export async function listNotesForClients(clientIds: string[]): Promise<SessionNote[]> {
  if (!clientIds.length) return [];
  try {
    if (usePostgres) {
      const sql = await pg();
      const rows = (await sql`SELECT * FROM session_notes WHERE client_id = ANY(${clientIds}) ORDER BY note_date DESC, created_at DESC`) as Record<string, unknown>[];
      return rows.map(rowToStored).map(toNote);
    }
    const set = new Set(clientIds);
    return readLocal().filter((r) => set.has(r.clientId)).sort((a, b) => b.noteDate.localeCompare(a.noteDate) || b.createdAt.localeCompare(a.createdAt)).map(toNote);
  } catch { return []; }
}

export async function getNote(id: string): Promise<SessionNote | null> {
  if (usePostgres) {
    const sql = await pg();
    const r = (await sql`SELECT * FROM session_notes WHERE id = ${id}`) as Record<string, unknown>[];
    return r[0] ? toNote(rowToStored(r[0])) : null;
  }
  const r = readLocal().find((x) => x.id === id);
  return r ? toNote(r) : null;
}

export async function addNote(input: { clientId: string; clinicianId: string; sessionId?: string | null; noteDate: string; soap: Soap }): Promise<SessionNote> {
  const now = new Date().toISOString();
  const row: StoredNote = { id: randomId(), clientId: input.clientId, clinicianId: input.clinicianId, sessionId: input.sessionId ?? null, noteDate: input.noteDate, bodyEnc: encodeSoap(input.soap), createdAt: now, updatedAt: now };
  if (usePostgres) {
    const sql = await pg();
    await sql`INSERT INTO session_notes (id, client_id, clinician_id, session_id, note_date, body_enc, created_at, updated_at)
      VALUES (${row.id}, ${row.clientId}, ${row.clinicianId}, ${row.sessionId}, ${row.noteDate}, ${row.bodyEnc}, ${row.createdAt}, ${row.updatedAt})`;
  } else {
    const all = readLocal(); all.push(row); writeLocal(all);
  }
  return toNote(row);
}

export async function updateNote(id: string, patch: { noteDate?: string; soap?: Soap }): Promise<boolean> {
  const now = new Date().toISOString();
  if (usePostgres) {
    const cur = await getNote(id);
    if (!cur) return false;
    const noteDate = patch.noteDate ?? cur.noteDate;
    const bodyEnc = encodeSoap(patch.soap ?? cur.soap);
    const sql = await pg();
    await sql`UPDATE session_notes SET note_date = ${noteDate}, body_enc = ${bodyEnc}, updated_at = ${now} WHERE id = ${id}`;
    return true;
  }
  const all = readLocal();
  const i = all.findIndex((x) => x.id === id);
  if (i < 0) return false;
  if (patch.noteDate) all[i].noteDate = patch.noteDate;
  if (patch.soap) all[i].bodyEnc = encodeSoap(patch.soap);
  all[i].updatedAt = now;
  writeLocal(all);
  return true;
}

export async function deleteNote(id: string): Promise<boolean> {
  if (usePostgres) {
    const sql = await pg();
    const r = (await sql`DELETE FROM session_notes WHERE id = ${id} RETURNING id`) as { id: string }[];
    return r.length > 0;
  }
  const all = readLocal();
  const next = all.filter((x) => x.id !== id);
  if (next.length === all.length) return false;
  writeLocal(next);
  return true;
}
