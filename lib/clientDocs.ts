// =============================================================================
// Stored document files for client records (referral letters, intake PDFs, etc.).
//
// The client's profile blob carries only the lightweight metadata for each
// document (name, kind, size, mime — see ClientDocument in clients.ts). The
// actual bytes live here, held ENCRYPTED (AES-256-GCM, same as every other piece
// of PHI) as base64 in content_enc, and are loaded only when a file is downloaded
// so ordinary record reads stay light.
//
//   • Production: Neon Postgres (DATABASE_URL), billing_client_docs table.
//   • Local dev:  data/billing-client-docs.local.json (gitignored).
// =============================================================================

import fs from "fs";
import path from "path";
import { encrypt, decrypt } from "./crypto";

/** Largest file we accept. Kept under Vercel's request-body ceiling so a
 *  multipart upload always fits; bigger files can still be attached as a link. */
export const MAX_DOC_BYTES = 4 * 1024 * 1024; // 4 MB

const usePostgres = !!process.env.DATABASE_URL;
async function pg() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.DATABASE_URL as string);
}
const dir = (f: string) => path.join(process.cwd(), "data", f);
const FILE = "billing-client-docs.local.json";
type LocalStore = Record<string, { clientId: string; contentEnc: string; mime: string; size: number; createdAt: string }>;
function readLocal(): LocalStore {
  try { return JSON.parse(fs.readFileSync(dir(FILE), "utf8")) as LocalStore; } catch { return {}; }
}
function writeLocal(data: LocalStore) {
  fs.mkdirSync(path.dirname(dir(FILE)), { recursive: true });
  fs.writeFileSync(dir(FILE), JSON.stringify(data, null, 2));
}

export interface DocFile { clientId: string; base64: string; mime: string; size: number }

/** Store (or replace) a document's bytes, encrypted. `base64` is the raw file
 *  content base64-encoded; `size` is the original byte length. */
export async function saveDocFile(docId: string, clientId: string, base64: string, mime: string, size: number): Promise<void> {
  const contentEnc = encrypt(base64);
  const createdAt = new Date().toISOString();
  if (usePostgres) {
    const sql = await pg();
    await sql`
      INSERT INTO billing_client_docs (id, client_id, content_enc, mime, size, created_at)
      VALUES (${docId}, ${clientId}, ${contentEnc}, ${mime}, ${size}, ${createdAt})
      ON CONFLICT (id) DO UPDATE SET content_enc = ${contentEnc}, mime = ${mime}, size = ${size}`;
    return;
  }
  const all = readLocal();
  all[docId] = { clientId, contentEnc, mime, size, createdAt };
  writeLocal(all);
}

/** Fetch a document's decrypted bytes (as base64) + its type, or null. */
export async function getDocFile(docId: string): Promise<DocFile | null> {
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`SELECT client_id, content_enc, mime, size FROM billing_client_docs WHERE id = ${docId}`) as Record<string, unknown>[];
    if (!rows.length) return null;
    const r = rows[0];
    return { clientId: String(r.client_id), base64: decrypt(String(r.content_enc)), mime: String(r.mime ?? "application/octet-stream"), size: Number(r.size ?? 0) };
  }
  const d = readLocal()[docId];
  if (!d) return null;
  return { clientId: d.clientId, base64: decrypt(d.contentEnc), mime: d.mime, size: d.size };
}

/** Remove one document's bytes. */
export async function deleteDocFile(docId: string): Promise<void> {
  if (usePostgres) {
    const sql = await pg();
    await sql`DELETE FROM billing_client_docs WHERE id = ${docId}`;
    return;
  }
  const all = readLocal();
  if (all[docId]) { delete all[docId]; writeLocal(all); }
}

/** List the files stored under one owner id (e.g. a ticket's images), lightest
 *  metadata only — no bytes. Used to show a ticket's / worklist item's images. */
export async function listDocMetaForClient(clientId: string): Promise<{ docId: string; mime: string; size: number }[]> {
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`SELECT id, mime, size FROM billing_client_docs WHERE client_id = ${clientId} ORDER BY created_at`) as Record<string, unknown>[];
    return rows.map((r) => ({ docId: String(r.id), mime: String(r.mime ?? "application/octet-stream"), size: Number(r.size ?? 0) }));
  }
  const all = readLocal();
  return Object.entries(all)
    .filter(([, v]) => v.clientId === clientId)
    .sort((a, b) => (a[1].createdAt ?? "").localeCompare(b[1].createdAt ?? ""))
    .map(([docId, v]) => ({ docId, mime: v.mime, size: v.size }));
}

/** Remove every stored file for a client (used when the client is deleted). */
export async function deleteDocFilesForClient(clientId: string): Promise<void> {
  if (usePostgres) {
    const sql = await pg();
    await sql`DELETE FROM billing_client_docs WHERE client_id = ${clientId}`;
    return;
  }
  const all = readLocal();
  let changed = false;
  for (const [k, v] of Object.entries(all)) { if (v.clientId === clientId) { delete all[k]; changed = true; } }
  if (changed) writeLocal(all);
}
