// =============================================================================
// TIFEC Billing System - data access layer (ADDITIVE; isolated from intake).
//   • Production: Neon Postgres (DATABASE_URL), billing_* tables (db/billing-schema.sql).
//   • Local dev:  data/billing-*.local.json files (gitignored).
// Client names are AES-encrypted at rest (lib/crypto), like intake answers.
// =============================================================================

import fs from "fs";
import path from "path";
import { encrypt, decrypt, randomId } from "./crypto";

export type CopayType = "none" | "fixed" | "percentage";

export interface Insurer {
  id: string;
  name: string;
  copayType: CopayType;
  copayRate: number; // fixed KYD amount, or percent 0-100
  active: boolean;
}

export interface CptCode {
  code: string;
  description: string;
  active: boolean;
}

export interface ClinicianBillingSettings {
  clinicianId: string;
  retentionPct: number; // % company keeps
  otherDeductionPct: number; // additional %
  otherDeductionFixed: number; // flat amount per payout
}

export interface SessionInput {
  clinicianId: string;
  clientFirst: string;
  clientLast: string;
  insurerId: string | null;
  dateOfService: string; // YYYY-MM-DD
  cptCodes: string[];
  durationHours: number;
  totalCost: number;
  copayCollected: number;
  notes?: string;
  createdBy: string;
}

export interface BillingSession {
  id: string;
  clinicianId: string;
  clientFirst: string;
  clientLast: string;
  insurerId: string | null;
  dateOfService: string;
  cptCodes: string[];
  durationHours: number;
  totalCost: number;
  copayCollected: number;
  insurancePaid: boolean;
  paidDate: string | null;
  notes: string;
  createdBy: string;
  createdAt: string;
}

const usePostgres = !!process.env.DATABASE_URL;
async function pg() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.DATABASE_URL as string);
}

// ---- local JSON fallback helpers -------------------------------------------
const dir = (f: string) => path.join(process.cwd(), "data", f);
function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(dir(file), "utf8")) as T;
  } catch {
    return fallback;
  }
}
function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(dir(file)), { recursive: true });
  fs.writeFileSync(dir(file), JSON.stringify(data, null, 2));
}
const INS_FILE = "billing-insurers.local.json";
const CPT_FILE = "billing-cpt.local.json";
const SET_FILE = "billing-settings.local.json";
const SESS_FILE = "billing-sessions.local.json";

const num = (v: unknown) => (v == null ? 0 : Number(v));

// ============================ Insurers ======================================
export async function listInsurers(): Promise<Insurer[]> {
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`SELECT * FROM billing_insurers ORDER BY name`) as Record<string, unknown>[];
    return rows.map((r) => ({ id: r.id as string, name: r.name as string, copayType: r.copay_type as CopayType, copayRate: num(r.copay_rate), active: !!r.active }));
  }
  return readJson<Insurer[]>(INS_FILE, []);
}

export async function upsertInsurer(ins: Omit<Insurer, "id"> & { id?: string }): Promise<Insurer> {
  const row: Insurer = { id: ins.id || randomId(), name: ins.name, copayType: ins.copayType, copayRate: ins.copayRate, active: ins.active ?? true };
  if (usePostgres) {
    const sql = await pg();
    await sql`
      INSERT INTO billing_insurers (id, name, copay_type, copay_rate, active)
      VALUES (${row.id}, ${row.name}, ${row.copayType}, ${row.copayRate}, ${row.active})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, copay_type = EXCLUDED.copay_type, copay_rate = EXCLUDED.copay_rate, active = EXCLUDED.active`;
    return row;
  }
  const all = readJson<Insurer[]>(INS_FILE, []);
  const i = all.findIndex((x) => x.id === row.id);
  if (i >= 0) all[i] = row;
  else all.push(row);
  writeJson(INS_FILE, all);
  return row;
}

export async function deleteInsurer(id: string): Promise<void> {
  if (usePostgres) {
    const sql = await pg();
    await sql`DELETE FROM billing_insurers WHERE id = ${id}`;
    return;
  }
  writeJson(INS_FILE, readJson<Insurer[]>(INS_FILE, []).filter((x) => x.id !== id));
}

// ============================ CPT codes =====================================
export async function listCptCodes(): Promise<CptCode[]> {
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`SELECT * FROM billing_cpt_codes ORDER BY code`) as Record<string, unknown>[];
    return rows.map((r) => ({ code: r.code as string, description: (r.description as string) || "", active: !!r.active }));
  }
  return readJson<CptCode[]>(CPT_FILE, []);
}

export async function upsertCptCode(c: CptCode): Promise<CptCode> {
  const row: CptCode = { code: c.code, description: c.description || "", active: c.active ?? true };
  if (usePostgres) {
    const sql = await pg();
    await sql`
      INSERT INTO billing_cpt_codes (code, description, active)
      VALUES (${row.code}, ${row.description}, ${row.active})
      ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active`;
    return row;
  }
  const all = readJson<CptCode[]>(CPT_FILE, []);
  const i = all.findIndex((x) => x.code === row.code);
  if (i >= 0) all[i] = row;
  else all.push(row);
  writeJson(CPT_FILE, all);
  return row;
}

export async function deleteCptCode(code: string): Promise<void> {
  if (usePostgres) {
    const sql = await pg();
    await sql`DELETE FROM billing_cpt_codes WHERE code = ${code}`;
    return;
  }
  writeJson(CPT_FILE, readJson<CptCode[]>(CPT_FILE, []).filter((x) => x.code !== code));
}

// ===================== Clinician billing settings ===========================
const DEFAULT_SETTINGS = (clinicianId: string): ClinicianBillingSettings => ({ clinicianId, retentionPct: 0, otherDeductionPct: 0, otherDeductionFixed: 0 });

export async function listClinicianSettings(): Promise<ClinicianBillingSettings[]> {
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`SELECT * FROM billing_clinician_settings`) as Record<string, unknown>[];
    return rows.map((r) => ({ clinicianId: r.clinician_id as string, retentionPct: num(r.retention_pct), otherDeductionPct: num(r.other_deduction_pct), otherDeductionFixed: num(r.other_deduction_fixed) }));
  }
  return readJson<ClinicianBillingSettings[]>(SET_FILE, []);
}

export async function getClinicianSettings(clinicianId: string): Promise<ClinicianBillingSettings> {
  const all = await listClinicianSettings();
  return all.find((s) => s.clinicianId === clinicianId) ?? DEFAULT_SETTINGS(clinicianId);
}

export async function upsertClinicianSettings(s: ClinicianBillingSettings): Promise<ClinicianBillingSettings> {
  if (usePostgres) {
    const sql = await pg();
    await sql`
      INSERT INTO billing_clinician_settings (clinician_id, retention_pct, other_deduction_pct, other_deduction_fixed, updated_at)
      VALUES (${s.clinicianId}, ${s.retentionPct}, ${s.otherDeductionPct}, ${s.otherDeductionFixed}, now())
      ON CONFLICT (clinician_id) DO UPDATE SET retention_pct = EXCLUDED.retention_pct, other_deduction_pct = EXCLUDED.other_deduction_pct, other_deduction_fixed = EXCLUDED.other_deduction_fixed, updated_at = now()`;
    return s;
  }
  const all = readJson<ClinicianBillingSettings[]>(SET_FILE, []);
  const i = all.findIndex((x) => x.clinicianId === s.clinicianId);
  if (i >= 0) all[i] = s;
  else all.push(s);
  writeJson(SET_FILE, all);
  return s;
}

// ============================ Sessions ======================================
interface StoredSession {
  id: string;
  clinicianId: string;
  clientEnc: string;
  insurerId: string | null;
  dateOfService: string;
  cptCodes: string[];
  durationHours: number;
  totalCost: number;
  copayCollected: number;
  insurancePaid: boolean;
  paidDate: string | null;
  notes: string;
  createdBy: string;
  createdAt: string;
}

function decryptSession(s: StoredSession): BillingSession {
  let first = "", last = "";
  try {
    const c = JSON.parse(decrypt(s.clientEnc)) as { first: string; last: string };
    first = c.first || "";
    last = c.last || "";
  } catch {
    first = "Unreadable";
  }
  return {
    id: s.id, clinicianId: s.clinicianId, clientFirst: first, clientLast: last, insurerId: s.insurerId,
    dateOfService: s.dateOfService, cptCodes: s.cptCodes || [], durationHours: num(s.durationHours), totalCost: num(s.totalCost),
    copayCollected: num(s.copayCollected), insurancePaid: !!s.insurancePaid, paidDate: s.paidDate, notes: s.notes || "",
    createdBy: s.createdBy, createdAt: s.createdAt,
  };
}

export async function insertSession(input: SessionInput): Promise<BillingSession> {
  const clientEnc = encrypt(JSON.stringify({ first: input.clientFirst, last: input.clientLast }));
  const id = randomId();
  const createdAt = new Date().toISOString();
  if (usePostgres) {
    const sql = await pg();
    await sql`
      INSERT INTO billing_sessions (id, clinician_id, client_enc, insurer_id, date_of_service, duration_hours, total_cost, copay_collected, insurance_paid, paid_date, notes, created_by, created_at)
      VALUES (${id}, ${input.clinicianId}, ${clientEnc}, ${input.insurerId}, ${input.dateOfService}, ${input.durationHours}, ${input.totalCost}, ${input.copayCollected}, ${false}, ${null}, ${input.notes ?? ""}, ${input.createdBy}, ${createdAt})`;
    for (const code of input.cptCodes) {
      await sql`INSERT INTO billing_session_cpt (session_id, code) VALUES (${id}, ${code}) ON CONFLICT DO NOTHING`;
    }
  } else {
    const all = readJson<StoredSession[]>(SESS_FILE, []);
    all.push({ id, clinicianId: input.clinicianId, clientEnc, insurerId: input.insurerId, dateOfService: input.dateOfService, cptCodes: input.cptCodes, durationHours: input.durationHours, totalCost: input.totalCost, copayCollected: input.copayCollected, insurancePaid: false, paidDate: null, notes: input.notes ?? "", createdBy: input.createdBy, createdAt });
    writeJson(SESS_FILE, all);
  }
  return decryptSession({ id, clinicianId: input.clinicianId, clientEnc, insurerId: input.insurerId, dateOfService: input.dateOfService, cptCodes: input.cptCodes, durationHours: input.durationHours, totalCost: input.totalCost, copayCollected: input.copayCollected, insurancePaid: false, paidDate: null, notes: input.notes ?? "", createdBy: input.createdBy, createdAt });
}

async function loadStored(): Promise<StoredSession[]> {
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`SELECT * FROM billing_sessions ORDER BY date_of_service DESC, created_at DESC`) as Record<string, unknown>[];
    const cpt = (await sql`SELECT session_id, code FROM billing_session_cpt`) as { session_id: string; code: string }[];
    const byId: Record<string, string[]> = {};
    for (const c of cpt) (byId[c.session_id] ||= []).push(c.code);
    return rows.map((r) => ({
      id: r.id as string, clinicianId: r.clinician_id as string, clientEnc: r.client_enc as string, insurerId: (r.insurer_id as string) ?? null,
      dateOfService: String(r.date_of_service).slice(0, 10), cptCodes: byId[r.id as string] || [], durationHours: num(r.duration_hours),
      totalCost: num(r.total_cost), copayCollected: num(r.copay_collected), insurancePaid: !!r.insurance_paid,
      paidDate: r.paid_date ? String(r.paid_date).slice(0, 10) : null, notes: (r.notes as string) || "", createdBy: r.created_by as string, createdAt: String(r.created_at),
    }));
  }
  return readJson<StoredSession[]>(SESS_FILE, []).sort((a, b) => b.dateOfService.localeCompare(a.dateOfService));
}

export async function listSessions(filter?: { clinicianId?: string }): Promise<BillingSession[]> {
  const all = await loadStored();
  const f = filter?.clinicianId ? all.filter((s) => s.clinicianId === filter.clinicianId) : all;
  return f.map(decryptSession);
}

export async function getSession(id: string): Promise<BillingSession | null> {
  const all = await loadStored();
  const s = all.find((x) => x.id === id);
  return s ? decryptSession(s) : null;
}

export async function markSessionPaid(id: string, paid: boolean, paidDate: string | null): Promise<boolean> {
  if (usePostgres) {
    const sql = await pg();
    const res = (await sql`UPDATE billing_sessions SET insurance_paid = ${paid}, paid_date = ${paid ? paidDate : null} WHERE id = ${id} RETURNING id`) as { id: string }[];
    return res.length > 0;
  }
  const all = readJson<StoredSession[]>(SESS_FILE, []);
  const s = all.find((x) => x.id === id);
  if (!s) return false;
  s.insurancePaid = paid;
  s.paidDate = paid ? paidDate : null;
  writeJson(SESS_FILE, all);
  return true;
}

export async function deleteSession(id: string): Promise<boolean> {
  if (usePostgres) {
    const sql = await pg();
    await sql`DELETE FROM billing_session_cpt WHERE session_id = ${id}`;
    const res = (await sql`DELETE FROM billing_sessions WHERE id = ${id} RETURNING id`) as { id: string }[];
    return res.length > 0;
  }
  const all = readJson<StoredSession[]>(SESS_FILE, []);
  const next = all.filter((x) => x.id !== id);
  if (next.length === all.length) return false;
  writeJson(SESS_FILE, next);
  return true;
}
