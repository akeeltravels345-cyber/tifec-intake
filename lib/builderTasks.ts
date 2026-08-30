// =============================================================================
// Builder task list: a private to-do list for the system admin (Akeel), shown
// on the Today page and nowhere else. Separate from the shared feature worklist
// (lib/worklist.ts, Akeel + Nick) — this one is the admin's alone.
// (ADDITIVE; separate from intake, billing, and comms tables.)
//   • Production: Neon Postgres (DATABASE_URL), builder_tasks table.
//   • Local dev:  data/builder-tasks.local.json (gitignored).
// Scoped by ownerId so a second admin would get their own list. Not encrypted:
// these are build/design notes, not client data (and the admin gate keeps them
// out of everyone else's view anyway).
// =============================================================================

import fs from "fs";
import path from "path";
import { randomId } from "./crypto";

export interface BuilderSub {
  id: string;
  text: string;
  done: boolean;
  optional: boolean;
}
export interface BuilderTask {
  id: string;
  ownerId: string;
  title: string;
  blurb: string;
  note: string;
  subs: BuilderSub[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

const usePostgres = !!process.env.DATABASE_URL;
async function pg() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.DATABASE_URL as string);
}

const FILE = "builder-tasks.local.json";
const dir = (f: string) => path.join(process.cwd(), "data", f);
function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(dir(file), "utf8")) as T; } catch { return fallback; }
}
function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(dir(file)), { recursive: true });
  fs.writeFileSync(dir(file), JSON.stringify(data, null, 2));
}

const str = (v: unknown) => (v == null ? "" : String(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : str(v));
const now = () => new Date().toISOString();
function safeJson(s: string): unknown { try { return JSON.parse(s); } catch { return []; } }
const parseSubs = (v: unknown): BuilderSub[] => {
  const raw = typeof v === "string" ? safeJson(v) : v;
  if (!Array.isArray(raw)) return [];
  return raw.map((s: Record<string, unknown>) => ({
    id: str(s.id) || randomId(), text: str(s.text), done: !!s.done, optional: !!s.optional,
  }));
};

// The starting list, seeded once when the admin first opens Today. After that
// it is theirs to edit; we only reseed if it is completely empty.
const DEFAULTS: { title: string; blurb: string; subs: { text: string; optional?: boolean }[] }[] = [
  { title: "Seasonal aesthetic design", blurb: "Light seasonal theming so the app feels fresh year-round, kept tasteful for a clinical tool.", subs: [
    { text: "Decide scope: subtle accents vs. fuller seasonal skins" },
    { text: "Define palettes for spring, summer, autumn, winter" },
    { text: "Apply to accent colours and small motifs" },
    { text: "Auto-switch by date (Cayman time)" },
  ] },
  { title: "Redesign for less clutter", blurb: "Simplify the busiest screens so the numbers that matter stand out.", subs: [
    { text: "Audit busiest screens: payout, Overview, biller dashboard" },
    { text: "Group or collapse secondary info" },
    { text: "Tighten spacing and type hierarchy" },
    { text: "Reduce competing colours" },
    { text: "Make the key numbers stand out" },
  ] },
  { title: "Encouraging words", blurb: "Warm, genuine notes for clinicians. No clichés.", subs: [
    { text: "Pick placement: payout header, month summary, or a rotating line" },
    { text: "Write a warm message set" },
    { text: "Fit the message to the month" },
    { text: "Wire it into the payout page" },
  ] },
  { title: "Task list on Today", blurb: "A private builder task list on Today, visible to the admin only.", subs: [
    { text: "Gate it to the system admin only (builder view)" },
    { text: "Place it on the Today page for the admin" },
    { text: "Design the add / check off / reorder interactions" },
    { text: "Wire to storage (Neon in prod, local in dev)" },
    { text: "Match the app look and Cayman-time stamps" },
  ] },
  { title: "System maintenance list", blurb: "Running upkeep so nothing drifts out of sync.", subs: [
    { text: "Run pending Neon migrations" },
    { text: "Remove the temporary Fix dates tool once cleanup is done" },
    { text: "Purge leaked PHI from git history", optional: true },
  ] },
];

function seedTasks(ownerId: string): BuilderTask[] {
  const t = now();
  return DEFAULTS.map((d, i) => ({
    id: randomId(), ownerId, title: d.title, blurb: d.blurb, note: "", sortOrder: i,
    subs: d.subs.map((s) => ({ id: randomId(), text: s.text, done: false, optional: !!s.optional })),
    createdAt: t, updatedAt: t,
  }));
}

async function insertTask(row: BuilderTask) {
  if (usePostgres) {
    const sql = await pg();
    await sql`
      INSERT INTO builder_tasks (id, owner_id, title, blurb, note, subs, sort_order, created_at, updated_at)
      VALUES (${row.id}, ${row.ownerId}, ${row.title}, ${row.blurb}, ${row.note},
              ${JSON.stringify(row.subs)}::jsonb, ${row.sortOrder}, ${row.createdAt}, ${row.updatedAt})`;
  } else {
    const all = readJson<BuilderTask[]>(FILE, []);
    all.push(row);
    writeJson(FILE, all);
  }
}

/** A user's tasks, ordered. When `seedDefaults` is set (the admin/builder only),
 *  seeds the starter workstreams the first time; everyone else starts empty and
 *  builds their own list. Never throws: if the table is missing pre-migration,
 *  returns []. */
export async function listBuilderTasks(ownerId: string, seedDefaults = false): Promise<BuilderTask[]> {
  let tasks: BuilderTask[];
  try {
    tasks = await rawList(ownerId);
  } catch {
    return []; // table not migrated yet — don't break the page
  }
  if (tasks.length === 0 && seedDefaults) {
    const seeded = seedTasks(ownerId);
    try { for (const row of seeded) await insertTask(row); } catch { return seeded; }
    tasks = seeded;
  }
  return tasks.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

async function rawList(ownerId: string): Promise<BuilderTask[]> {
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`
      SELECT id, owner_id, title, blurb, note, subs, sort_order, created_at, updated_at
      FROM builder_tasks WHERE owner_id = ${ownerId}`) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: str(r.id), ownerId: str(r.owner_id), title: str(r.title), blurb: str(r.blurb),
      note: str(r.note), subs: parseSubs(r.subs), sortOrder: Number(r.sort_order) || 0,
      createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
    }));
  }
  return readJson<BuilderTask[]>(FILE, []).filter((t) => t.ownerId === ownerId);
}

async function getTask(ownerId: string, taskId: string): Promise<BuilderTask | null> {
  return (await rawList(ownerId)).find((t) => t.id === taskId) ?? null;
}

async function persist(task: BuilderTask) {
  task.updatedAt = now();
  if (usePostgres) {
    const sql = await pg();
    await sql`
      UPDATE builder_tasks SET title = ${task.title}, blurb = ${task.blurb}, note = ${task.note},
        subs = ${JSON.stringify(task.subs)}::jsonb, sort_order = ${task.sortOrder}, updated_at = ${task.updatedAt}
      WHERE id = ${task.id} AND owner_id = ${task.ownerId}`;
  } else {
    const all = readJson<BuilderTask[]>(FILE, []);
    const i = all.findIndex((t) => t.id === task.id && t.ownerId === task.ownerId);
    if (i >= 0) { all[i] = task; writeJson(FILE, all); }
  }
}

export async function createTask(ownerId: string, title: string, blurb = ""): Promise<BuilderTask> {
  const existing = await rawList(ownerId);
  const maxOrder = existing.reduce((m, t) => Math.max(m, t.sortOrder), -1);
  const t = now();
  const row: BuilderTask = { id: randomId(), ownerId, title: title.trim(), blurb: blurb.trim(), note: "", subs: [], sortOrder: maxOrder + 1, createdAt: t, updatedAt: t };
  await insertTask(row);
  return row;
}

export async function updateTask(ownerId: string, taskId: string, patch: { title?: string; blurb?: string; note?: string }): Promise<BuilderTask | null> {
  const task = await getTask(ownerId, taskId);
  if (!task) return null;
  if (patch.title != null) task.title = patch.title.trim();
  if (patch.blurb != null) task.blurb = patch.blurb.trim();
  if (patch.note != null) task.note = patch.note;
  await persist(task);
  return task;
}

export async function deleteTask(ownerId: string, taskId: string): Promise<void> {
  if (usePostgres) {
    const sql = await pg();
    await sql`DELETE FROM builder_tasks WHERE id = ${taskId} AND owner_id = ${ownerId}`;
  } else {
    const all = readJson<BuilderTask[]>(FILE, []);
    writeJson(FILE, all.filter((t) => !(t.id === taskId && t.ownerId === ownerId)));
  }
}

export async function addSub(ownerId: string, taskId: string, text: string): Promise<BuilderTask | null> {
  const task = await getTask(ownerId, taskId);
  if (!task) return null;
  task.subs.push({ id: randomId(), text: text.trim(), done: false, optional: false });
  await persist(task);
  return task;
}

export async function toggleSub(ownerId: string, taskId: string, subId: string, done: boolean): Promise<BuilderTask | null> {
  const task = await getTask(ownerId, taskId);
  if (!task) return null;
  const sub = task.subs.find((s) => s.id === subId);
  if (!sub) return null;
  sub.done = done;
  await persist(task);
  return task;
}

export async function deleteSub(ownerId: string, taskId: string, subId: string): Promise<BuilderTask | null> {
  const task = await getTask(ownerId, taskId);
  if (!task) return null;
  task.subs = task.subs.filter((s) => s.id !== subId);
  await persist(task);
  return task;
}

/** Reorder the owner's tasks to match the given id order. */
export async function reorderTasks(ownerId: string, orderedIds: string[]): Promise<void> {
  const tasks = await rawList(ownerId);
  const pos = new Map(orderedIds.map((id, i) => [id, i] as const));
  for (const t of tasks) {
    const next = pos.get(t.id);
    if (next != null && next !== t.sortOrder) { t.sortOrder = next; await persist(t); }
  }
}
