// In-app notification inbox for clinicians, plus the single entry point that
// records a notification AND pushes it to the clinician's devices. One call
// keeps the bell/inbox in the mobile app and the on-device push in lock-step.
// Dual-mode like the rest of the app:
//   Postgres: scheduling_notifications   Local: data/scheduling-notifications.local.json
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { sendPushToClinician } from "./push";

export type NotificationType = "booking" | "reschedule" | "cancel" | "reminder";

export interface AppNotification {
  id: string;
  clinicianId: string;
  type: NotificationType;
  title: string;
  body: string;
  url: string;
  apptId: string | null;
  createdAt: string;
  readAt: string | null;
}

const usePostgres = !!process.env.DATABASE_URL;
async function pg() { const { neon } = await import("@neondatabase/serverless"); return neon(process.env.DATABASE_URL as string); }
const FILE = "scheduling-notifications.local.json";
const dir = (f: string) => path.join(process.cwd(), "data", f);
function readJson<T>(file: string, fallback: T): T { try { return JSON.parse(fs.readFileSync(dir(file), "utf8")) as T; } catch { return fallback; } }
function writeJson(file: string, data: unknown) { fs.mkdirSync(path.dirname(dir(file)), { recursive: true }); fs.writeFileSync(dir(file), JSON.stringify(data, null, 2)); }

// Self-create on first use so no separate prod migration is needed (same pattern
// as push_subscriptions).
type Sql = Awaited<ReturnType<typeof pg>>;
async function ensureTable(sql: Sql) {
  await sql`CREATE TABLE IF NOT EXISTS scheduling_notifications (
    id text PRIMARY KEY,
    clinician_id text NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    url text NOT NULL DEFAULT '/m',
    appt_id text,
    created_at timestamptz DEFAULT now(),
    read_at timestamptz
  )`;
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? "" : String(v));
const rowTo = (r: Record<string, unknown>): AppNotification => ({
  id: String(r.id), clinicianId: String(r.clinician_id), type: String(r.type) as NotificationType,
  title: String(r.title), body: String(r.body), url: String(r.url || "/m"),
  apptId: r.appt_id ? String(r.appt_id) : null,
  createdAt: iso(r.created_at), readAt: r.read_at ? iso(r.read_at) : null,
});

export async function addNotification(n: Omit<AppNotification, "id" | "createdAt" | "readAt">): Promise<AppNotification> {
  const rec: AppNotification = { ...n, id: randomBytes(10).toString("hex"), createdAt: new Date().toISOString(), readAt: null };
  try {
    if (usePostgres) {
      const sql = await pg(); await ensureTable(sql);
      await sql`INSERT INTO scheduling_notifications (id, clinician_id, type, title, body, url, appt_id, created_at)
        VALUES (${rec.id}, ${rec.clinicianId}, ${rec.type}, ${rec.title}, ${rec.body}, ${rec.url}, ${rec.apptId}, now())`;
    } else {
      const all = readJson<AppNotification[]>(FILE, []);
      all.unshift(rec);
      writeJson(FILE, all.slice(0, 1000)); // keep the local file bounded
    }
  } catch (e) { console.error("addNotification failed", e); }
  return rec;
}

export async function listNotifications(clinicianId: string, limit = 50): Promise<AppNotification[]> {
  if (!clinicianId) return [];
  try {
    if (usePostgres) {
      const sql = await pg(); await ensureTable(sql);
      const rows = (await sql`SELECT * FROM scheduling_notifications WHERE clinician_id=${clinicianId} ORDER BY created_at DESC LIMIT ${limit}`) as Record<string, unknown>[];
      return rows.map(rowTo);
    }
    return readJson<AppNotification[]>(FILE, [])
      .filter((n) => n.clinicianId === clinicianId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  } catch { return []; }
}

export async function unreadCount(clinicianId: string): Promise<number> {
  if (!clinicianId) return 0;
  try {
    if (usePostgres) {
      const sql = await pg(); await ensureTable(sql);
      const r = (await sql`SELECT count(*)::int AS n FROM scheduling_notifications WHERE clinician_id=${clinicianId} AND read_at IS NULL`) as { n: number }[];
      return r[0]?.n || 0;
    }
    return readJson<AppNotification[]>(FILE, []).filter((n) => n.clinicianId === clinicianId && !n.readAt).length;
  } catch { return 0; }
}

export async function markRead(clinicianId: string, id: string): Promise<void> {
  if (!clinicianId || !id) return;
  try {
    if (usePostgres) {
      const sql = await pg(); await ensureTable(sql);
      await sql`UPDATE scheduling_notifications SET read_at=now() WHERE id=${id} AND clinician_id=${clinicianId} AND read_at IS NULL`;
      return;
    }
    const all = readJson<AppNotification[]>(FILE, []);
    writeJson(FILE, all.map((n) => (n.id === id && n.clinicianId === clinicianId && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)));
  } catch { /* best-effort */ }
}

export async function markAllRead(clinicianId: string): Promise<void> {
  if (!clinicianId) return;
  try {
    if (usePostgres) {
      const sql = await pg(); await ensureTable(sql);
      await sql`UPDATE scheduling_notifications SET read_at=now() WHERE clinician_id=${clinicianId} AND read_at IS NULL`;
      return;
    }
    const now = new Date().toISOString();
    const all = readJson<AppNotification[]>(FILE, []);
    writeJson(FILE, all.map((n) => (n.clinicianId === clinicianId && !n.readAt ? { ...n, readAt: now } : n)));
  } catch { /* best-effort */ }
}

/** Has a notification of this type for this appointment already been recorded?
 *  Used to make the reminder cron idempotent (don't nag twice for one visit). */
export async function hasApptNotification(clinicianId: string, apptId: string, type: NotificationType): Promise<boolean> {
  if (!clinicianId || !apptId) return false;
  try {
    if (usePostgres) {
      const sql = await pg(); await ensureTable(sql);
      const r = (await sql`SELECT 1 FROM scheduling_notifications WHERE clinician_id=${clinicianId} AND appt_id=${apptId} AND type=${type} LIMIT 1`) as unknown[];
      return r.length > 0;
    }
    return readJson<AppNotification[]>(FILE, []).some((n) => n.clinicianId === clinicianId && n.apptId === apptId && n.type === type);
  } catch { return false; }
}

/** Record a notification in the clinician's inbox AND push it to their devices.
 *  Best-effort: never throws, so it can't break a booking. Skips entirely when
 *  the clinician is the one who made the change (no point pinging yourself). */
export async function notifyClinician(
  clinicianId: string,
  n: { type: NotificationType; title: string; body: string; url?: string; apptId?: string | null },
  opts?: { actorId?: string },
): Promise<void> {
  if (!clinicianId) return;
  if (opts?.actorId && opts.actorId === clinicianId) return;
  const apptId = n.apptId ?? null;
  const url = n.url || (apptId ? `/m/appt/${apptId}` : "/m");
  await addNotification({ clinicianId, type: n.type, title: n.title, body: n.body, url, apptId });
  try {
    await sendPushToClinician(clinicianId, { title: n.title, body: n.body, url, tag: apptId ? `${n.type}-${apptId}` : undefined });
  } catch { /* push is best-effort; the inbox entry still landed */ }
}
