// =============================================================================
// A clinician's OWN monthly expenses — private to them, never shown on the
// company payout statement. Some are running (recurring, carried forward month
// to month); some are one-off (that month only). Stored per clinician per month
// so the list can change every month. Each saved month also records when it was
// saved. Running items are SEEDED forward, not shared: each month keeps its own
// copy, so correcting July never changes June.
// =============================================================================

import fs from "fs";
import path from "path";

export interface ClinicianExpense {
  id: string;
  name: string;
  amount: number;                  // KYD
  kind: "running" | "oneoff";      // running carries forward; one-off does not
}

/** A saved month: its rows plus when it was saved. */
interface MonthSnap { items: ClinicianExpense[]; savedAt?: string }

const usePostgres = !!process.env.DATABASE_URL;
async function pg() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.DATABASE_URL as string);
}

const FILE = "billing-clinician-expenses.local.json";
const dir = (f: string) => path.join(process.cwd(), "data", f);
// Stored value is a MonthSnap; older data may be a bare array — read both.
type StoredVal = MonthSnap | ClinicianExpense[];
type Store = Record<string, Record<string, StoredVal>>;
function readAll(): Store {
  try { return JSON.parse(fs.readFileSync(dir(FILE), "utf8")) as Store; } catch { return {}; }
}
function writeAll(data: Store) {
  fs.mkdirSync(path.dirname(dir(FILE)), { recursive: true });
  fs.writeFileSync(dir(FILE), JSON.stringify(data, null, 2));
}

export const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;
const rid = () => Math.random().toString(36).slice(2, 10);

function clean(e: Partial<ClinicianExpense>): ClinicianExpense {
  return {
    id: String(e.id || rid()),
    name: String(e.name ?? "").slice(0, 120),
    amount: Number.isFinite(Number(e.amount)) ? Math.max(0, Math.round(Number(e.amount) * 100) / 100) : 0,
    kind: e.kind === "oneoff" ? "oneoff" : "running",
  };
}
/** Accept both the new {items,savedAt} shape and the legacy bare-array shape. */
function normSnap(v: StoredVal | unknown): MonthSnap {
  if (Array.isArray(v)) return { items: v.map(clean) };
  const o = (v ?? {}) as { items?: unknown; savedAt?: unknown };
  return { items: Array.isArray(o.items) ? o.items.map(clean) : [], savedAt: o.savedAt ? String(o.savedAt) : undefined };
}

/** Every month snapshot this clinician has saved. */
async function snapshotsFor(clinicianId: string): Promise<Record<string, MonthSnap>> {
  const out: Record<string, MonthSnap> = {};
  if (usePostgres) {
    try {
      const sql = await pg();
      const rows = (await sql`SELECT month, expenses FROM billing_clinician_expenses WHERE clinician_id = ${clinicianId}`) as { month: string; expenses: unknown }[];
      for (const r of rows) {
        const val = typeof r.expenses === "string" ? JSON.parse(r.expenses) : r.expenses;
        out[String(r.month)] = normSnap(val);
      }
    } catch {
      // Table not migrated yet (or a transient DB error): degrade to "no expenses"
      // rather than 500 the clinician's dashboard.
    }
    return out;
  }
  const raw = readAll()[clinicianId] ?? {};
  for (const [m, v] of Object.entries(raw)) out[m] = normSnap(v);
  return out;
}

/** The expenses that apply to a month: that month's saved list if it exists,
 *  otherwise the most recent EARLIER month's RUNNING items carried forward
 *  (one-offs are intentionally dropped), otherwise an empty list. */
export async function resolveClinicianExpenses(
  clinicianId: string, year: number, month: number,
): Promise<{ expenses: ClinicianExpense[]; source: "month" | "carried" | "base"; from?: string; savedAt?: string }> {
  const snaps = await snapshotsFor(clinicianId);
  const key = monthKey(year, month);
  if (snaps[key]) return { expenses: snaps[key].items, source: "month", savedAt: snaps[key].savedAt };
  const earlier = Object.keys(snaps).filter((k) => k < key).sort();
  if (earlier.length) {
    const from = earlier[earlier.length - 1];
    const carried = snaps[from].items.filter((e) => e.kind === "running");
    return { expenses: carried, source: "carried", from };
  }
  return { expenses: [], source: "base" };
}

/** Save (replace) one clinician's expenses for one month, stamping savedAt. */
export async function saveClinicianExpenses(clinicianId: string, month: string, expenses: ClinicianExpense[], savedAt: string): Promise<{ expenses: ClinicianExpense[]; savedAt: string }> {
  const cleaned = expenses.map(clean).filter((e) => e.name.trim() || e.amount > 0);
  const snap: MonthSnap = { items: cleaned, savedAt };
  if (usePostgres) {
    const sql = await pg();
    await sql`
      INSERT INTO billing_clinician_expenses (clinician_id, month, expenses)
      VALUES (${clinicianId}, ${month}, ${JSON.stringify(snap)}::jsonb)
      ON CONFLICT (clinician_id, month) DO UPDATE SET expenses = EXCLUDED.expenses`;
    return { expenses: cleaned, savedAt };
  }
  const all = readAll();
  all[clinicianId] = { ...(all[clinicianId] ?? {}), [month]: snap };
  writeAll(all);
  return { expenses: cleaned, savedAt };
}

export const clinicianExpensesTotal = (expenses: ClinicianExpense[]): number =>
  Math.round(expenses.reduce((t, e) => t + (e.amount || 0), 0) * 100) / 100;
