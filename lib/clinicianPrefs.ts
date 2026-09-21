// Per-clinician preferences (small, guarded). Currently just the daily agenda
// email opt-out. Defaults to ON, so a clinician who has never touched it still
// gets their morning agenda; they can turn it off any time.
//   Postgres: scheduling_clinician_prefs   Local: data/scheduling-clinician-prefs.local.json
import fs from "fs";
import path from "path";

export interface ClinicianPrefs { dailyAgenda: boolean; }
const DEFAULTS: ClinicianPrefs = { dailyAgenda: true };

const usePostgres = !!process.env.DATABASE_URL;
async function pg() { const { neon } = await import("@neondatabase/serverless"); return neon(process.env.DATABASE_URL as string); }
const FILE = "scheduling-clinician-prefs.local.json";
const dir = (f: string) => path.join(process.cwd(), "data", f);
function readJson<T>(file: string, fallback: T): T { try { return JSON.parse(fs.readFileSync(dir(file), "utf8")) as T; } catch { return fallback; } }
function writeJson(file: string, data: unknown) { fs.mkdirSync(path.dirname(dir(file)), { recursive: true }); fs.writeFileSync(dir(file), JSON.stringify(data, null, 2)); }

function normalize(row: Record<string, unknown> | null): ClinicianPrefs {
  if (!row) return { ...DEFAULTS };
  return { dailyAgenda: row.daily_agenda == null ? true : !!row.daily_agenda };
}

export async function getClinicianPrefs(clinicianId: string): Promise<ClinicianPrefs> {
  if (!clinicianId) return { ...DEFAULTS };
  try {
    if (usePostgres) { const sql = await pg(); const r = (await sql`SELECT * FROM scheduling_clinician_prefs WHERE clinician_id=${clinicianId}`) as Record<string, unknown>[]; return normalize(r[0] || null); }
    const all = readJson<Record<string, ClinicianPrefs>>(FILE, {});
    return { ...DEFAULTS, ...(all[clinicianId] || {}) };
  } catch { return { ...DEFAULTS }; }
}

export async function setClinicianPrefs(clinicianId: string, patch: Partial<ClinicianPrefs>): Promise<ClinicianPrefs> {
  const next = { ...(await getClinicianPrefs(clinicianId)), ...patch };
  try {
    if (usePostgres) {
      const sql = await pg();
      await sql`INSERT INTO scheduling_clinician_prefs (clinician_id, daily_agenda, updated_at)
        VALUES (${clinicianId}, ${next.dailyAgenda}, now())
        ON CONFLICT (clinician_id) DO UPDATE SET daily_agenda=${next.dailyAgenda}, updated_at=now()`;
    } else {
      const all = readJson<Record<string, ClinicianPrefs>>(FILE, {}); all[clinicianId] = next; writeJson(FILE, all);
    }
  } catch { /* table not migrated yet — falls back to defaults on read */ }
  return next;
}
