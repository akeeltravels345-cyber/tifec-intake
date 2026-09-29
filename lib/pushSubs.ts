// Web-push subscriptions, one row per device a clinician has enabled. Keyed by
// the push endpoint (unique per device/browser). Dual-mode like the rest:
//   Postgres: push_subscriptions   Local: data/push-subscriptions.local.json
import fs from "fs";
import path from "path";

export interface PushSub {
  clinicianId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const usePostgres = !!process.env.DATABASE_URL;
async function pg() { const { neon } = await import("@neondatabase/serverless"); return neon(process.env.DATABASE_URL as string); }
const FILE = "push-subscriptions.local.json";
const dir = (f: string) => path.join(process.cwd(), "data", f);
function readJson<T>(file: string, fallback: T): T { try { return JSON.parse(fs.readFileSync(dir(file), "utf8")) as T; } catch { return fallback; } }
function writeJson(file: string, data: unknown) { fs.mkdirSync(path.dirname(dir(file)), { recursive: true }); fs.writeFileSync(dir(file), JSON.stringify(data, null, 2)); }

export async function savePushSub(sub: PushSub): Promise<void> {
  if (!sub.clinicianId || !sub.endpoint) return;
  if (usePostgres) {
    const sql = await pg();
    // Self-create on first use so no separate prod migration is needed.
    await sql`CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint text PRIMARY KEY,
      clinician_id text NOT NULL,
      p256dh text NOT NULL,
      auth text NOT NULL,
      created_at timestamptz DEFAULT now()
    )`;
    await sql`INSERT INTO push_subscriptions (endpoint, clinician_id, p256dh, auth, created_at)
      VALUES (${sub.endpoint}, ${sub.clinicianId}, ${sub.p256dh}, ${sub.auth}, now())
      ON CONFLICT (endpoint) DO UPDATE SET clinician_id=${sub.clinicianId}, p256dh=${sub.p256dh}, auth=${sub.auth}`;
    return;
  }
  const all = readJson<PushSub[]>(FILE, []);
  writeJson(FILE, [...all.filter((s) => s.endpoint !== sub.endpoint), sub]);
}

export async function removePushSub(endpoint: string): Promise<void> {
  if (!endpoint) return;
  if (usePostgres) { const sql = await pg(); await sql`DELETE FROM push_subscriptions WHERE endpoint=${endpoint}`; return; }
  const all = readJson<PushSub[]>(FILE, []);
  writeJson(FILE, all.filter((s) => s.endpoint !== endpoint));
}

export async function listPushSubs(clinicianId: string): Promise<PushSub[]> {
  if (!clinicianId) return [];
  try {
    if (usePostgres) {
      const sql = await pg();
      const rows = (await sql`SELECT endpoint, clinician_id, p256dh, auth FROM push_subscriptions WHERE clinician_id=${clinicianId}`) as Record<string, string>[];
      return rows.map((r) => ({ clinicianId: r.clinician_id, endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }));
    }
    return readJson<PushSub[]>(FILE, []).filter((s) => s.clinicianId === clinicianId);
  } catch { return []; }
}

export async function hasPushSub(clinicianId: string): Promise<boolean> {
  return (await listPushSubs(clinicianId)).length > 0;
}
