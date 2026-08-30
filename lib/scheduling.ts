// =============================================================================
// Scheduling — Phase 1 foundation. (ADDITIVE; separate from intake, billing and
// comms tables, and connects to them by shared ids rather than touching them.)
//   • Production: Neon Postgres (DATABASE_URL), scheduling_* tables.
//   • Local dev:  data/scheduling-*.local.json (gitignored).
// This file starts with appointment types; availability and appointments follow
// in the same additive style. Everything degrades to empty if unmigrated, so a
// page never 500s before the tables exist.
// =============================================================================

import fs from "fs";
import path from "path";
import { randomId } from "./crypto";

export type AppointmentMode = "in_person" | "virtual" | "either";

export interface AppointmentType {
  id: string;
  name: string;
  category: string;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  price: number;                 // KYD, shown at booking; 0 = not shown
  color: string;                 // hex, for the calendar
  mode: AppointmentMode;
  baselineCptCodes: string[];    // starting codes; editable on the session later
  intakeFormKey: string | null;  // which intake form to attach, if any
  newClientIntakeOnly: boolean;  // only require the form for new clients
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

const usePostgres = !!process.env.DATABASE_URL;
async function pg() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.DATABASE_URL as string);
}

const FILE = "scheduling-types.local.json";
const dir = (f: string) => path.join(process.cwd(), "data", f);
function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(dir(file), "utf8")) as T; } catch { return fallback; }
}
function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(dir(file)), { recursive: true });
  fs.writeFileSync(dir(file), JSON.stringify(data, null, 2));
}

const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : str(v));
const now = () => new Date().toISOString();
const MODES: AppointmentMode[] = ["in_person", "virtual", "either"];
const asMode = (v: unknown): AppointmentMode => (MODES.includes(v as AppointmentMode) ? (v as AppointmentMode) : "in_person");
function parseCodes(v: unknown): string[] {
  const raw = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return []; } })() : v;
  return Array.isArray(raw) ? raw.map(str).filter(Boolean) : [];
}

function rowToType(r: Record<string, unknown>): AppointmentType {
  return {
    id: str(r.id), name: str(r.name), category: str(r.category),
    durationMin: num(r.duration_min), bufferBeforeMin: num(r.buffer_before_min), bufferAfterMin: num(r.buffer_after_min),
    price: num(r.price), color: str(r.color) || "#2f8e93", mode: asMode(r.mode),
    baselineCptCodes: parseCodes(r.baseline_cpt_codes),
    intakeFormKey: r.intake_form_key ? str(r.intake_form_key) : null,
    newClientIntakeOnly: !!r.new_client_intake_only,
    active: r.active == null ? true : !!r.active,
    sortOrder: num(r.sort_order), createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
  };
}

export async function listAppointmentTypes(): Promise<AppointmentType[]> {
  let rows: AppointmentType[];
  try {
    if (usePostgres) {
      const sql = await pg();
      const res = (await sql`SELECT * FROM scheduling_appointment_types`) as Record<string, unknown>[];
      rows = res.map(rowToType);
    } else {
      rows = readJson<AppointmentType[]>(FILE, []);
    }
  } catch {
    return []; // table not migrated yet — don't break the page
  }
  return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

type TypeInput = Partial<Omit<AppointmentType, "id" | "createdAt" | "updatedAt">>;

function normalize(input: TypeInput, base?: AppointmentType): AppointmentType {
  const t = now();
  const b = base ?? {
    id: randomId(), name: "", category: "", durationMin: 50, bufferBeforeMin: 0, bufferAfterMin: 0,
    price: 0, color: "#2f8e93", mode: "in_person" as AppointmentMode, baselineCptCodes: [],
    intakeFormKey: null, newClientIntakeOnly: true, active: true, sortOrder: 0, createdAt: t, updatedAt: t,
  };
  return {
    ...b,
    name: input.name != null ? str(input.name).trim() : b.name,
    category: input.category != null ? str(input.category).trim() : b.category,
    durationMin: input.durationMin != null ? Math.max(5, num(input.durationMin)) : b.durationMin,
    bufferBeforeMin: input.bufferBeforeMin != null ? Math.max(0, num(input.bufferBeforeMin)) : b.bufferBeforeMin,
    bufferAfterMin: input.bufferAfterMin != null ? Math.max(0, num(input.bufferAfterMin)) : b.bufferAfterMin,
    price: input.price != null ? Math.max(0, num(input.price)) : b.price,
    color: input.color != null ? str(input.color) : b.color,
    mode: input.mode != null ? asMode(input.mode) : b.mode,
    baselineCptCodes: input.baselineCptCodes != null ? parseCodes(input.baselineCptCodes) : b.baselineCptCodes,
    intakeFormKey: input.intakeFormKey !== undefined ? (input.intakeFormKey ? str(input.intakeFormKey) : null) : b.intakeFormKey,
    newClientIntakeOnly: input.newClientIntakeOnly != null ? !!input.newClientIntakeOnly : b.newClientIntakeOnly,
    active: input.active != null ? !!input.active : b.active,
    sortOrder: input.sortOrder != null ? num(input.sortOrder) : b.sortOrder,
    updatedAt: t,
  };
}

async function persist(row: AppointmentType, isNew: boolean) {
  if (usePostgres) {
    const sql = await pg();
    if (isNew) {
      await sql`INSERT INTO scheduling_appointment_types
        (id, name, category, duration_min, buffer_before_min, buffer_after_min, price, color, mode,
         baseline_cpt_codes, intake_form_key, new_client_intake_only, active, sort_order, created_at, updated_at)
        VALUES (${row.id}, ${row.name}, ${row.category}, ${row.durationMin}, ${row.bufferBeforeMin}, ${row.bufferAfterMin},
         ${row.price}, ${row.color}, ${row.mode}, ${JSON.stringify(row.baselineCptCodes)}::jsonb, ${row.intakeFormKey},
         ${row.newClientIntakeOnly}, ${row.active}, ${row.sortOrder}, ${row.createdAt}, ${row.updatedAt})`;
    } else {
      await sql`UPDATE scheduling_appointment_types SET
        name=${row.name}, category=${row.category}, duration_min=${row.durationMin}, buffer_before_min=${row.bufferBeforeMin},
        buffer_after_min=${row.bufferAfterMin}, price=${row.price}, color=${row.color}, mode=${row.mode},
        baseline_cpt_codes=${JSON.stringify(row.baselineCptCodes)}::jsonb, intake_form_key=${row.intakeFormKey},
        new_client_intake_only=${row.newClientIntakeOnly}, active=${row.active}, sort_order=${row.sortOrder}, updated_at=${row.updatedAt}
        WHERE id=${row.id}`;
    }
  } else {
    const all = readJson<AppointmentType[]>(FILE, []);
    const i = all.findIndex((t) => t.id === row.id);
    if (i >= 0) all[i] = row; else all.push(row);
    writeJson(FILE, all);
  }
}

export async function createAppointmentType(input: TypeInput): Promise<AppointmentType> {
  const existing = await listAppointmentTypes();
  const row = normalize({ ...input, sortOrder: input.sortOrder ?? existing.reduce((m, t) => Math.max(m, t.sortOrder), -1) + 1 });
  await persist(row, true);
  return row;
}

export async function updateAppointmentType(id: string, input: TypeInput): Promise<AppointmentType | null> {
  const all = await listAppointmentTypes();
  const base = all.find((t) => t.id === id);
  if (!base) return null;
  const row = normalize(input, base);
  await persist(row, false);
  return row;
}

export async function deleteAppointmentType(id: string): Promise<void> {
  if (usePostgres) {
    const sql = await pg();
    await sql`DELETE FROM scheduling_appointment_types WHERE id=${id}`;
  } else {
    writeJson(FILE, readJson<AppointmentType[]>(FILE, []).filter((t) => t.id !== id));
  }
}

export async function reorderAppointmentTypes(orderedIds: string[]): Promise<void> {
  const all = await listAppointmentTypes();
  const pos = new Map(orderedIds.map((id, i) => [id, i] as const));
  for (const t of all) {
    const next = pos.get(t.id);
    if (next != null && next !== t.sortOrder) { await persist({ ...t, sortOrder: next, updatedAt: now() }, false); }
  }
}
