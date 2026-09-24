// =============================================================================
// HIPAA compliance tracker — an in-app project board for the owner + admin.
// The task LIST is fixed (the compliance steps, defined here); only each task's
// STATUS and progress COMMENTS are stored and editable. Shared (not per-user), so
// the owner and Akeel see and update the same board.
//   • Production: Neon Postgres, hipaa_task_state table (self-migrating).
//   • Local dev:  data/hipaa.local.json (gitignored).
// Not encrypted: these are compliance-project notes, not client PHI, and the
// page is gated to the owner + admin.
// =============================================================================

import fs from "fs";
import path from "path";
import { randomId } from "./crypto";

export type HipaaStatus = "todo" | "doing" | "done" | "blocked";
export const HIPAA_STATUSES: HipaaStatus[] = ["todo", "doing", "done", "blocked"];

export interface HipaaComment { id: string; at: string; byId: string; byName: string; text: string }
export interface HipaaTask {
  id: string;
  title: string;
  detail: string;
  category: string;
  priority?: "now" | "soon" | "later";
}
export interface HipaaTaskState { status: HipaaStatus; comments: HipaaComment[] }
export interface HipaaBoardItem extends HipaaTask, HipaaTaskState {}

// Safeguards already in place — the locks, keys and cameras the app already has.
// Plain-language, for the owner. Static (not editable), shown above the checklist.
export interface HipaaSafeguard { title: string; detail: string }
export const HIPAA_SAFEGUARDS: HipaaSafeguard[] = [
  { title: "Everything sensitive is encrypted", detail: "Client names, birth dates, clinical notes, intake answers and uploaded documents are all stored scrambled with a bank-grade method (AES-256), and scrambled again while travelling over the internet." },
  { title: "Everyone has their own private login", detail: "Each person signs in with their own account, and passwords are never stored as readable text — only a one-way scrambled version, so even we can't see them." },
  { title: "People only see what they should", detail: "A therapist sees only their own clients; the biller sees billing; the owner and admin oversee. Access is limited by role." },
  { title: "There's a history log of who did what", detail: "The app records who opened or changed each client's record, and when — and the log itself never stores health details." },
  { title: "It logs people out automatically", detail: "If a screen is left unattended, the app signs the person out after a set time, so an open computer doesn't leave records exposed." },
  { title: "Emails and links never carry health details", detail: "Notification emails contain only a secure link that requires a login — never client information — and no personal details are ever put into web addresses." },
  { title: "Changes are read-only when viewing as someone", detail: "When an admin views the app as another person, they can look but not change anything, so the audit trail always shows who really did what." },
];

// The compliance checklist. Order = the sensible order to work through it.
export const HIPAA_TASKS: HipaaTask[] = [
  { id: "baa", title: "Sign Business Associate Agreements (BAAs)", category: "Agreements", priority: "now",
    detail: "Every vendor that stores or handles health information on your behalf must sign a BAA — the website host, the database provider, and your email, video and calendar services. This is the single most important item." },
  { id: "email", title: "Move email off consumer Gmail", category: "Technical", priority: "now",
    detail: "The app currently sends from a regular Gmail address, which isn't allowed for health information. Move to Google Workspace with a signed BAA, or a healthcare-grade email service." },
  { id: "privacy-policy", title: "Write the privacy policy", category: "Policies", priority: "soon",
    detail: "A written privacy policy covering how client information is used and protected." },
  { id: "security-policy", title: "Write the security policy", category: "Policies", priority: "soon",
    detail: "A written security policy covering access, devices, passwords and safeguards." },
  { id: "breach-plan", title: "Write the breach-response plan", category: "Policies", priority: "soon",
    detail: "A documented plan for what you do if information is ever exposed — who's notified, and when." },
  { id: "retention-policy", title: "Write the records retention & disposal policy", category: "Policies", priority: "soon",
    detail: "How long records are kept and how they're securely disposed of." },
  { id: "training", title: "Train staff + confidentiality agreements", category: "Training", priority: "soon",
    detail: "Everyone who touches client information needs basic HIPAA training and should sign a confidentiality agreement. Keep a record that they completed it." },
  { id: "risk-assessment", title: "Documented risk assessment", category: "Assessment", priority: "soon",
    detail: "A written review of where the information lives and what could go wrong, usually done with a compliance consultant and refreshed periodically." },
  { id: "mfa", title: "Turn on two-step login (MFA) for staff", category: "Technical", priority: "soon",
    detail: "A one-time code from a phone in addition to the password. Not built yet — Akeel can add it. One of the strongest, cheapest ways to prevent stolen-password break-ins." },
  { id: "tech-hygiene", title: "Technical hygiene: private repo, key vault, backups", category: "Technical", priority: "later",
    detail: "Make the code repository private, store the master encryption key in a secure vault with a rotation plan, and confirm the database's automatic backups are on and can be restored." },
  { id: "sign-off", title: "Professional HIPAA sign-off", category: "Sign-off", priority: "later",
    detail: "Have a HIPAA compliance consultant or healthcare attorney review the whole setup — what turns 'we built it carefully' into 'we are compliant', on paper." },
];

const usePostgres = !!process.env.DATABASE_URL;
async function pg() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.DATABASE_URL as string);
}

const FILE = "hipaa.local.json";
const dir = (f: string) => path.join(process.cwd(), "data", f);
function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(dir(file), "utf8")) as T; } catch { return fallback; }
}
function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(dir(file)), { recursive: true });
  fs.writeFileSync(dir(file), JSON.stringify(data, null, 2));
}

type StateMap = Record<string, HipaaTaskState>;

function normStatus(v: unknown): HipaaStatus {
  return HIPAA_STATUSES.includes(v as HipaaStatus) ? (v as HipaaStatus) : "todo";
}
function normComments(v: unknown): HipaaComment[] {
  const raw = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return []; } })() : v;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c: Record<string, unknown>) => ({
      id: String(c.id ?? randomId()),
      at: String(c.at ?? ""),
      byId: String(c.byId ?? ""),
      byName: String(c.byName ?? ""),
      text: String(c.text ?? ""),
    }))
    .filter((c) => c.text);
}

let colsEnsured = false;
async function ensureTable(sql: Awaited<ReturnType<typeof pg>>): Promise<void> {
  if (colsEnsured) return;
  await sql`CREATE TABLE IF NOT EXISTS hipaa_task_state (task_id text PRIMARY KEY, status text NOT NULL DEFAULT 'todo', comments jsonb NOT NULL DEFAULT '[]', updated_at timestamptz NOT NULL DEFAULT now())`;
  colsEnsured = true;
}

async function readStates(): Promise<StateMap> {
  if (usePostgres) {
    const sql = await pg();
    await ensureTable(sql);
    const rows = (await sql`SELECT task_id, status, comments FROM hipaa_task_state`) as Record<string, unknown>[];
    const out: StateMap = {};
    for (const r of rows) out[String(r.task_id)] = { status: normStatus(r.status), comments: normComments(r.comments) };
    return out;
  }
  return readJson<StateMap>(FILE, {});
}

/** The full board: every canonical task merged with its stored status + comments. */
export async function getHipaaBoard(): Promise<HipaaBoardItem[]> {
  const states = await readStates();
  return HIPAA_TASKS.map((t) => {
    const s = states[t.id] ?? { status: "todo" as HipaaStatus, comments: [] };
    return { ...t, status: s.status, comments: s.comments };
  });
}

export async function setHipaaStatus(taskId: string, status: HipaaStatus): Promise<void> {
  if (!HIPAA_TASKS.some((t) => t.id === taskId)) return;
  const st = normStatus(status);
  if (usePostgres) {
    const sql = await pg();
    await ensureTable(sql);
    await sql`
      INSERT INTO hipaa_task_state (task_id, status, updated_at) VALUES (${taskId}, ${st}, now())
      ON CONFLICT (task_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()`;
    return;
  }
  const all = readJson<StateMap>(FILE, {});
  all[taskId] = { status: st, comments: all[taskId]?.comments ?? [] };
  writeJson(FILE, all);
}

export async function addHipaaComment(taskId: string, by: { id: string; name: string }, text: string): Promise<HipaaComment | null> {
  const body = text.trim();
  if (!body || !HIPAA_TASKS.some((t) => t.id === taskId)) return null;
  const comment: HipaaComment = { id: randomId(), at: new Date().toISOString(), byId: by.id, byName: by.name, text: body.slice(0, 4000) };
  if (usePostgres) {
    const sql = await pg();
    await ensureTable(sql);
    // Append atomically to the JSONB array, creating the row if it's new.
    await sql`
      INSERT INTO hipaa_task_state (task_id, comments, updated_at)
      VALUES (${taskId}, ${JSON.stringify([comment])}::jsonb, now())
      ON CONFLICT (task_id) DO UPDATE SET comments = hipaa_task_state.comments || ${JSON.stringify([comment])}::jsonb, updated_at = now()`;
    return comment;
  }
  const all = readJson<StateMap>(FILE, {});
  const cur = all[taskId] ?? { status: "todo" as HipaaStatus, comments: [] };
  cur.comments = [...cur.comments, comment];
  all[taskId] = cur;
  writeJson(FILE, all);
  return comment;
}
