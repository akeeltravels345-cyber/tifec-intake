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
  claimCode?: string; // payer code printed on CMS-1500 box 10d / header (e.g. "362")
}

// A clinician OUTSIDE the practice whose billing the biller handles privately.
// They have no intake login and never appear in TIFEC's own revenue or payouts —
// the only money they drive is the biller's own commission.
export interface ExternalClinician {
  id: string;
  name: string;
  billerPct: number; // biller's commission % on this clinician's insurance collected
  active: boolean;
}

/** One time/value option on a service code (e.g. "15 min" @ $57.11). */
export interface CptVariant { label: string; minutes: number; fee: number }

export interface CptCode {
  code: string;
  description: string;
  active: boolean;
  fee?: number;   // default service fee for this code (KYD) = primary variant fee
  hrs?: number;   // duration in hours = primary variant minutes / 60
  variants?: CptVariant[]; // extra time/value options; [0] is the default
}

/** The code's options, always as a non-empty list. A code with no explicit
 *  variants yields one synthesized from its fee/hrs, so callers never special-case. */
export function cptVariantList(c: CptCode): CptVariant[] {
  if (c.variants && c.variants.length) return c.variants;
  const minutes = Math.round((c.hrs ?? 1) * 60);
  return [{ label: `${minutes} min`, minutes, fee: c.fee ?? 0 }];
}

// Practice-wide money rules the owner controls in Setup.
export interface RunningExpense {
  id: string;
  name: string;
  detail: string;   // who / what
  amount: number;   // monthly KYD
  breakdown?: { label: string; amount: number }[];
}
// The practice/provider identifiers a CMS-1500 claim needs (boxes 25, 31-33 and
// the rendering NPI per clinician). Kept here so the claim generator can fill
// them; empty by default until the owner enters them in Setup.
export interface ProviderConfig {
  practiceName?: string;
  npi?: string;            // billing provider NPI (box 33a)
  ein?: string;            // Federal Tax ID / EIN (box 25)
  taxonomy?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  postal?: string;
  country?: string;
  phone?: string;
  email?: string;          // shown on self-pay invoices
  website?: string;        // shown on self-pay invoices
  renderingNpi?: Record<string, string>; // clinicianId -> rendering NPI (box 24J)
}
export interface PracticeConfig {
  billerCommissionPct: number; // % of insurance collected paid to the biller
  processingFeePct?: number; // builder's platform fee — % of TOTAL cash collected
  runningExpenses: RunningExpense[]; // base/default list — the fallback for any month
  /** Per-month expense snapshots (key "YYYY-MM"). Expenses change month to month,
   *  so each month can carry its own set; a month with no snapshot carries forward
   *  the most recent earlier month's, falling back to the base list. */
  monthlyExpenses?: Record<string, RunningExpense[]>;
  provider?: ProviderConfig;
}
export const DEFAULT_PRACTICE_CONFIG: PracticeConfig = {
  billerCommissionPct: 3,
  processingFeePct: 2,
  provider: {},
  runningExpenses: [
    { id: "mktg", name: "Marketing & admin", detail: "Akeel O'Connor", amount: 1300, breakdown: [
      { label: "Social media", amount: 500 }, { label: "Web support", amount: 500 }, { label: "Ads", amount: 300 } ] },
    { id: "rent", name: "Office rent", detail: "Grand Cayman suite", amount: 750 },
    { id: "power", name: "Power & internet", detail: "Utilities", amount: 150 },
    { id: "ehr", name: "EHR & billing software", detail: "Clinical records", amount: 110 },
    { id: "workspace", name: "Google Workspace", detail: "Email & docs", amount: 40 },
    { id: "books", name: "Bookkeeping", detail: "Monthly accounts", amount: 30 },
  ],
};

export interface ClinicianBillingSettings {
  clinicianId: string;
  retentionPct: number; // % company keeps
  otherDeductionPct: number; // additional %
  otherDeductionFixed: number; // flat amount per payout (health)
  pension: number; // flat pension amount deducted per payout
  billerPct?: number; // biller commission % on THIS clinician's insurance collected
  billerBasePct?: number; // the biller % is charged on THIS share of their insurance billed (default 100)
  billerCommissionApplies?: boolean; // does the practice-wide biller 3% apply to this clinician?
  noPayout?: boolean; // owner who draws nothing: no retention/deductions, payout 0, all stays with the practice
}

/** Self-pay disposition. Undefined/null = paid in full at the visit (the default,
 *  so legacy self-pay is unchanged). "owing" = a running balance the client still
 *  owes. "waived" = the fee was written off. Ignored for insured sessions. */
export type SelfPayStatus = "owing" | "waived" | null;

export interface SessionInput {
  clinicianId: string;
  clientFirst: string;
  clientLast: string;
  clientId?: string | null; // practice-level client record (billing_clients.id)
  insurerId: string | null;
  dateOfService: string; // YYYY-MM-DD
  cptCodes: string[];
  durationHours: number;
  totalCost: number;
  copayCollected: number;
  copayDue?: number; // co-pay that should have been collected (defaults to collected)
  selfPayStatus?: SelfPayStatus;
  notes?: string;
  createdBy: string;
  /** A session moves logged -> billed (submitted) -> paid (collected). Normally
   *  it starts logged; an import may bring history in already billed or paid. */
  billedDate?: string | null;
  insurancePaid?: boolean;
  paidDate?: string | null;
  // Claim settled with an adjustment: a contractual write-off or a write-down.
  // insuranceCollected is the cash actually collected on it (rest = the adjustment).
  insuranceDisposition?: InsuranceDisposition;
  insuranceCollected?: number | null;
}

export type InsuranceDisposition = "writeoff" | "writedown" | null;

export interface BillingSession {
  id: string;
  clinicianId: string;
  clientFirst: string;
  clientLast: string;
  clientId: string | null;
  insurerId: string | null;
  dateOfService: string;
  cptCodes: string[];
  durationHours: number;
  totalCost: number;
  copayCollected: number;
  copayDue: number;            // co-pay that should have been collected
  selfPayStatus: SelfPayStatus; // self-pay disposition (null = paid in full)
  billedDate: string | null;   // submitted to insurer (null = not yet billed)
  insurancePaid: boolean;      // insurer has settled (= collected)
  paidDate: string | null;
  insuranceDisposition: InsuranceDisposition; // writeoff | writedown | null
  insuranceCollected: number | null;          // cash collected when adjusted (null = n/a)
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
const CFG_FILE = "billing-config.local.json";
const EXT_FILE = "billing-external.local.json";

const num = (v: unknown) => (v == null ? 0 : Number(v));

// ============================ Insurers ======================================
export async function listInsurers(): Promise<Insurer[]> {
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`SELECT * FROM billing_insurers ORDER BY name`) as Record<string, unknown>[];
    return rows.map((r) => ({ id: r.id as string, name: r.name as string, copayType: r.copay_type as CopayType, copayRate: num(r.copay_rate), active: !!r.active, claimCode: r.claim_code ? String(r.claim_code) : undefined }));
  }
  return readJson<Insurer[]>(INS_FILE, []);
}

export async function upsertInsurer(ins: Omit<Insurer, "id"> & { id?: string }): Promise<Insurer> {
  const row: Insurer = { id: ins.id || randomId(), name: ins.name, copayType: ins.copayType, copayRate: ins.copayRate, active: ins.active ?? true, claimCode: ins.claimCode?.trim() || undefined };
  if (usePostgres) {
    const sql = await pg();
    await sql`
      INSERT INTO billing_insurers (id, name, copay_type, copay_rate, active, claim_code)
      VALUES (${row.id}, ${row.name}, ${row.copayType}, ${row.copayRate}, ${row.active}, ${row.claimCode ?? null})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, copay_type = EXCLUDED.copay_type, copay_rate = EXCLUDED.copay_rate, active = EXCLUDED.active, claim_code = EXCLUDED.claim_code`;
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

// --- Outside clinicians (biller's private clients) --------------------------
// Ids are prefixed so a session's clinician_id can never collide with a real
// roster id in lib/clinicians.ts, and so the owner's pages (which map over
// CLINICIANS) naturally skip them.
export const EXTERNAL_PREFIX = "ext-";
export const isExternalId = (id: string) => id.startsWith(EXTERNAL_PREFIX);

export async function listExternalClinicians(): Promise<ExternalClinician[]> {
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`SELECT * FROM billing_external_clinicians ORDER BY name`) as Record<string, unknown>[];
    return rows.map((r) => ({ id: r.id as string, name: r.name as string, billerPct: num(r.biller_pct), active: !!r.active }));
  }
  return readJson<ExternalClinician[]>(EXT_FILE, []);
}

export async function upsertExternalClinician(c: Omit<ExternalClinician, "id"> & { id?: string }): Promise<ExternalClinician> {
  const row: ExternalClinician = {
    id: c.id || EXTERNAL_PREFIX + randomId(),
    name: c.name,
    billerPct: c.billerPct,
    active: c.active ?? true,
  };
  if (usePostgres) {
    const sql = await pg();
    await sql`
      INSERT INTO billing_external_clinicians (id, name, biller_pct, active)
      VALUES (${row.id}, ${row.name}, ${row.billerPct}, ${row.active})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, biller_pct = EXCLUDED.biller_pct, active = EXCLUDED.active`;
    return row;
  }
  const all = readJson<ExternalClinician[]>(EXT_FILE, []);
  const i = all.findIndex((x) => x.id === row.id);
  if (i >= 0) all[i] = row;
  else all.push(row);
  writeJson(EXT_FILE, all);
  return row;
}

export async function deleteExternalClinician(id: string): Promise<void> {
  if (usePostgres) {
    const sql = await pg();
    await sql`DELETE FROM billing_external_clinicians WHERE id = ${id}`;
    return;
  }
  writeJson(EXT_FILE, readJson<ExternalClinician[]>(EXT_FILE, []).filter((x) => x.id !== id));
}

// ============================ CPT codes =====================================
function parseVariants(v: unknown): CptVariant[] | undefined {
  const arr = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v;
  if (!Array.isArray(arr)) return undefined;
  const clean = arr
    .map((x) => ({ label: String((x as CptVariant).label ?? ""), minutes: Number((x as CptVariant).minutes) || 0, fee: Number((x as CptVariant).fee) || 0 }))
    .filter((x) => x.minutes > 0 || x.fee > 0);
  return clean.length ? clean : undefined;
}

export async function listCptCodes(): Promise<CptCode[]> {
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`SELECT * FROM billing_cpt_codes ORDER BY code`) as Record<string, unknown>[];
    return rows.map((r) => ({ code: r.code as string, description: (r.description as string) || "", active: !!r.active, fee: r.fee == null ? undefined : num(r.fee), hrs: r.hrs == null ? undefined : num(r.hrs), variants: parseVariants(r.variants) }));
  }
  return readJson<CptCode[]>(CPT_FILE, []);
}

export async function upsertCptCode(c: CptCode): Promise<CptCode> {
  // Keep the base fee/hrs in step with the primary (first) variant so every
  // existing reader (session form, importers) still works unchanged.
  const variants = c.variants && c.variants.length ? c.variants : undefined;
  const primary = variants?.[0];
  const fee = primary ? primary.fee : c.fee;
  const hrs = primary ? primary.minutes / 60 : c.hrs;
  const row: CptCode = { code: c.code, description: c.description || "", active: c.active ?? true, fee, hrs, variants };
  if (usePostgres) {
    const sql = await pg();
    const vjson = variants ? JSON.stringify(variants) : null;
    try {
      await sql`
        INSERT INTO billing_cpt_codes (code, description, active, fee, hrs, variants)
        VALUES (${row.code}, ${row.description}, ${row.active}, ${fee ?? null}, ${hrs ?? null}, ${vjson}::jsonb)
        ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs, variants = EXCLUDED.variants`;
    } catch {
      // variants column not migrated yet — save the base code so nothing breaks.
      await sql`
        INSERT INTO billing_cpt_codes (code, description, active, fee, hrs)
        VALUES (${row.code}, ${row.description}, ${row.active}, ${fee ?? null}, ${hrs ?? null})
        ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs`;
    }
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
// The practice keeps 40% by default; each clinician can be overridden in Setup.
const DEFAULT_SETTINGS = (clinicianId: string): ClinicianBillingSettings => ({ clinicianId, retentionPct: 40, otherDeductionPct: 0, otherDeductionFixed: 0, pension: 0, billerPct: 0, billerBasePct: 0, billerCommissionApplies: false, noPayout: false });

export async function listClinicianSettings(): Promise<ClinicianBillingSettings[]> {
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`SELECT * FROM billing_clinician_settings`) as Record<string, unknown>[];
    return rows.map((r) => ({ clinicianId: r.clinician_id as string, retentionPct: num(r.retention_pct), otherDeductionPct: num(r.other_deduction_pct), otherDeductionFixed: num(r.other_deduction_fixed), pension: num(r.pension), billerPct: r.biller_pct == null ? undefined : num(r.biller_pct), billerBasePct: r.biller_base_pct == null ? 0 : num(r.biller_base_pct), billerCommissionApplies: !!r.biller_commission_applies, noPayout: !!r.no_payout }));
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
      INSERT INTO billing_clinician_settings (clinician_id, retention_pct, other_deduction_pct, other_deduction_fixed, pension, biller_pct, biller_base_pct, biller_commission_applies, no_payout, updated_at)
      VALUES (${s.clinicianId}, ${s.retentionPct}, ${s.otherDeductionPct}, ${s.otherDeductionFixed}, ${s.pension ?? 0}, ${s.billerPct ?? null}, ${s.billerBasePct ?? 0}, ${s.billerCommissionApplies ?? false}, ${s.noPayout ?? false}, now())
      ON CONFLICT (clinician_id) DO UPDATE SET retention_pct = EXCLUDED.retention_pct, other_deduction_pct = EXCLUDED.other_deduction_pct, other_deduction_fixed = EXCLUDED.other_deduction_fixed, pension = EXCLUDED.pension, biller_pct = EXCLUDED.biller_pct, biller_base_pct = EXCLUDED.biller_base_pct, biller_commission_applies = EXCLUDED.biller_commission_applies, no_payout = EXCLUDED.no_payout, updated_at = now()`;
    return s;
  }
  const all = readJson<ClinicianBillingSettings[]>(SET_FILE, []);
  const i = all.findIndex((x) => x.clinicianId === s.clinicianId);
  if (i >= 0) all[i] = s;
  else all.push(s);
  writeJson(SET_FILE, all);
  return s;
}

// ===================== Practice config (biller %, expenses) =================
export async function getPracticeConfig(): Promise<PracticeConfig> {
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`SELECT value FROM billing_config WHERE key = 'practice'`) as { value: unknown }[];
    if (rows.length && rows[0].value) {
      const v = (typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value) as PracticeConfig;
      return { ...DEFAULT_PRACTICE_CONFIG, ...v };
    }
    return DEFAULT_PRACTICE_CONFIG;
  }
  // Merge defaults so a config saved before a new field (e.g. processingFeePct)
  // still picks it up — matching the Postgres path above.
  return { ...DEFAULT_PRACTICE_CONFIG, ...readJson<Partial<PracticeConfig>>(CFG_FILE, {}) } as PracticeConfig;
}

export async function savePracticeConfig(cfg: PracticeConfig): Promise<PracticeConfig> {
  if (usePostgres) {
    const sql = await pg();
    await sql`
      INSERT INTO billing_config (key, value) VALUES ('practice', ${JSON.stringify(cfg)}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    return cfg;
  }
  writeJson(CFG_FILE, cfg);
  return cfg;
}

export const runningExpensesTotal = (cfg: PracticeConfig): number =>
  Math.round(cfg.runningExpenses.reduce((t, e) => t + (e.amount || 0), 0) * 100) / 100;

/** The expenses that apply to a given month: that month's snapshot if it exists,
 *  otherwise the most recent EARLIER month's snapshot (carried forward), otherwise
 *  the base list. Returns whether the result is an explicit snapshot for the month
 *  or an inherited/base fallback, so the UI can show which. */
export function expensesForMonth(cfg: PracticeConfig, year: number, month: number): { expenses: RunningExpense[]; source: "month" | "carried" | "base"; from?: string } {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  const snaps = cfg.monthlyExpenses ?? {};
  if (snaps[key]) return { expenses: snaps[key], source: "month" };
  const earlier = Object.keys(snaps).filter((k) => k < key).sort();
  if (earlier.length) { const from = earlier[earlier.length - 1]; return { expenses: snaps[from], source: "carried", from }; }
  return { expenses: cfg.runningExpenses, source: "base" };
}

export const runningExpensesTotalForMonth = (cfg: PracticeConfig, year: number, month: number): number =>
  Math.round(expensesForMonth(cfg, year, month).expenses.reduce((t, e) => t + (e.amount || 0), 0) * 100) / 100;

// ============================ Sessions ======================================
interface StoredSession {
  id: string;
  clinicianId: string;
  clientEnc: string;
  clientId: string | null;
  insurerId: string | null;
  dateOfService: string;
  cptCodes: string[];
  durationHours: number;
  totalCost: number;
  copayCollected: number;
  copayDue?: number;
  selfPayStatus?: SelfPayStatus;
  billedDate: string | null;
  insurancePaid: boolean;
  paidDate: string | null;
  insuranceDisposition?: InsuranceDisposition;
  insuranceCollected?: number | null;
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
    id: s.id, clinicianId: s.clinicianId, clientFirst: first, clientLast: last, clientId: s.clientId ?? null, insurerId: s.insurerId,
    dateOfService: s.dateOfService, cptCodes: s.cptCodes || [], durationHours: num(s.durationHours), totalCost: num(s.totalCost),
    copayCollected: num(s.copayCollected), copayDue: s.copayDue == null ? num(s.copayCollected) : num(s.copayDue),
    selfPayStatus: s.selfPayStatus === "owing" || s.selfPayStatus === "waived" ? s.selfPayStatus : null,
    billedDate: s.billedDate ?? null, insurancePaid: !!s.insurancePaid, paidDate: s.paidDate,
    insuranceDisposition: s.insuranceDisposition === "writeoff" || s.insuranceDisposition === "writedown" ? s.insuranceDisposition : null,
    insuranceCollected: s.insuranceCollected == null ? null : num(s.insuranceCollected),
    notes: s.notes || "",
    createdBy: s.createdBy, createdAt: s.createdAt,
  };
}

export async function insertSession(input: SessionInput): Promise<BillingSession> {
  const clientEnc = encrypt(JSON.stringify({ first: input.clientFirst, last: input.clientLast }));
  const id = randomId();
  const createdAt = new Date().toISOString();
  const paid = input.insurancePaid ?? false;
  const paidDate = paid ? (input.paidDate ?? null) : null;
  // A paid claim was necessarily billed first; default billed_date to the paid
  // date if the caller didn't supply one, so the lifecycle stays consistent.
  const billedDate = input.billedDate ?? (paid ? paidDate : null);
  const clientId = input.clientId ?? null;
  const copayDue = input.copayDue == null ? input.copayCollected : input.copayDue;
  const selfPayStatus = input.selfPayStatus ?? null;
  const insuranceDisposition = input.insuranceDisposition ?? null;
  const insuranceCollected = input.insuranceCollected ?? null;
  const stored: StoredSession = { id, clinicianId: input.clinicianId, clientEnc, clientId, insurerId: input.insurerId, dateOfService: input.dateOfService, cptCodes: input.cptCodes, durationHours: input.durationHours, totalCost: input.totalCost, copayCollected: input.copayCollected, copayDue, selfPayStatus, billedDate, insurancePaid: paid, paidDate, insuranceDisposition, insuranceCollected, notes: input.notes ?? "", createdBy: input.createdBy, createdAt };
  if (usePostgres) {
    const sql = await pg();
    try {
      await sql`
        INSERT INTO billing_sessions (id, clinician_id, client_enc, client_id, insurer_id, date_of_service, duration_hours, total_cost, copay_collected, copay_due, self_pay_status, billed_date, insurance_paid, paid_date, notes, created_by, created_at)
        VALUES (${id}, ${input.clinicianId}, ${clientEnc}, ${clientId}, ${input.insurerId}, ${input.dateOfService}, ${input.durationHours}, ${input.totalCost}, ${input.copayCollected}, ${copayDue}, ${selfPayStatus}, ${billedDate}, ${paid}, ${paidDate}, ${input.notes ?? ""}, ${input.createdBy}, ${createdAt})`;
    } catch {
      // Pre-migration: insert without self_pay_status so logging still works.
      await sql`
        INSERT INTO billing_sessions (id, clinician_id, client_enc, client_id, insurer_id, date_of_service, duration_hours, total_cost, copay_collected, copay_due, billed_date, insurance_paid, paid_date, notes, created_by, created_at)
        VALUES (${id}, ${input.clinicianId}, ${clientEnc}, ${clientId}, ${input.insurerId}, ${input.dateOfService}, ${input.durationHours}, ${input.totalCost}, ${input.copayCollected}, ${copayDue}, ${billedDate}, ${paid}, ${paidDate}, ${input.notes ?? ""}, ${input.createdBy}, ${createdAt})`;
    }
    for (const code of input.cptCodes) {
      await sql`INSERT INTO billing_session_cpt (session_id, code) VALUES (${id}, ${code}) ON CONFLICT DO NOTHING`;
    }
    // Insurance adjustment (write-off / write-down) — a separate guarded write so
    // it's independent of the self_pay migration and a no-op before its own runs.
    if (insuranceDisposition) await writeInsuranceAdjust(sql, id, insuranceDisposition, insuranceCollected);
  } else {
    const all = readJson<StoredSession[]>(SESS_FILE, []);
    all.push(stored);
    writeJson(SESS_FILE, all);
  }
  return decryptSession(stored);
}

/** Write the insurance-adjustment columns; no-op if the migration hasn't run. */
async function writeInsuranceAdjust(sql: Awaited<ReturnType<typeof pg>>, id: string, disposition: InsuranceDisposition, collected: number | null): Promise<void> {
  try {
    await sql`UPDATE billing_sessions SET insurance_disposition = ${disposition}, insurance_collected = ${collected} WHERE id = ${id}`;
  } catch { /* column not migrated yet */ }
}

async function loadStored(): Promise<StoredSession[]> {
  if (usePostgres) {
    const sql = await pg();
    // Cast DATE columns to text so they arrive as "YYYY-MM-DD" (the driver otherwise
    // returns JS Date objects, which String().slice() mangled — breaking month filters).
    // self_pay_status is added by db/migrate-self-pay-status.sql; fall back to a
    // read without it so the app never 500s if the migration hasn't run yet.
    let rows: Record<string, unknown>[];
    try {
      rows = (await sql`SELECT id, clinician_id, client_enc, client_id, insurer_id, date_of_service::text AS date_of_service, duration_hours, total_cost, copay_collected, copay_due, self_pay_status, billed_date::text AS billed_date, insurance_paid, paid_date::text AS paid_date, notes, created_by, created_at FROM billing_sessions ORDER BY date_of_service DESC, created_at DESC`) as Record<string, unknown>[];
    } catch {
      rows = (await sql`SELECT id, clinician_id, client_enc, client_id, insurer_id, date_of_service::text AS date_of_service, duration_hours, total_cost, copay_collected, copay_due, billed_date::text AS billed_date, insurance_paid, paid_date::text AS paid_date, notes, created_by, created_at FROM billing_sessions ORDER BY date_of_service DESC, created_at DESC`) as Record<string, unknown>[];
    }
    const cpt = (await sql`SELECT session_id, code FROM billing_session_cpt`) as { session_id: string; code: string }[];
    const byId: Record<string, string[]> = {};
    for (const c of cpt) (byId[c.session_id] ||= []).push(c.code);
    // Insurance adjustments live in their own (optionally-migrated) columns; read
    // them separately so a missing column never breaks the main session read.
    const adj: Record<string, { disposition: InsuranceDisposition; collected: number | null }> = {};
    try {
      const arows = (await sql`SELECT id, insurance_disposition, insurance_collected FROM billing_sessions WHERE insurance_disposition IS NOT NULL`) as Record<string, unknown>[];
      for (const a of arows) adj[a.id as string] = { disposition: (a.insurance_disposition === "writeoff" || a.insurance_disposition === "writedown" ? a.insurance_disposition : null) as InsuranceDisposition, collected: a.insurance_collected == null ? null : num(a.insurance_collected) };
    } catch { /* columns not migrated yet */ }
    return rows.map((r) => ({
      id: r.id as string, clinicianId: r.clinician_id as string, clientEnc: r.client_enc as string, clientId: (r.client_id as string) ?? null, insurerId: (r.insurer_id as string) ?? null,
      dateOfService: String(r.date_of_service).slice(0, 10), cptCodes: byId[r.id as string] || [], durationHours: num(r.duration_hours),
      // copay_due may be NULL on rows predating the write-off feature; leave it
      // undefined so decryptSession falls back to copay_collected for those.
      totalCost: num(r.total_cost), copayCollected: num(r.copay_collected), copayDue: r.copay_due == null ? undefined : num(r.copay_due),
      selfPayStatus: r.self_pay_status === "owing" || r.self_pay_status === "waived" ? r.self_pay_status : null,
      billedDate: r.billed_date ? String(r.billed_date).slice(0, 10) : null, insurancePaid: !!r.insurance_paid,
      paidDate: r.paid_date ? String(r.paid_date).slice(0, 10) : null,
      insuranceDisposition: adj[r.id as string]?.disposition ?? null, insuranceCollected: adj[r.id as string]?.collected ?? null,
      notes: (r.notes as string) || "", createdBy: r.created_by as string, createdAt: String(r.created_at),
    }));
  }
  return readJson<StoredSession[]>(SESS_FILE, []).sort((a, b) => b.dateOfService.localeCompare(a.dateOfService));
}

export async function listSessions(filter?: { clinicianId?: string; clientId?: string }): Promise<BillingSession[]> {
  const all = await loadStored();
  let f = all;
  if (filter?.clinicianId) f = f.filter((s) => s.clinicianId === filter.clinicianId);
  if (filter?.clientId) f = f.filter((s) => s.clientId === filter.clientId);
  return f.map(decryptSession);
}

export async function getSession(id: string): Promise<BillingSession | null> {
  const all = await loadStored();
  const s = all.find((x) => x.id === id);
  return s ? decryptSession(s) : null;
}

/** Settle (or unsettle) a self-pay balance from the billing queue: paid means the
 *  client cleared the balance, so record the full fee collected + the payment date;
 *  undo puts the whole fee back as owed. Keeps self_pay_status = 'owing' so the
 *  visit stays on the running-credit ledger. */
export async function markSelfPayPaid(id: string, paid: boolean, paidDate: string | null): Promise<boolean> {
  if (usePostgres) {
    const sql = await pg();
    const res = (await sql`
      UPDATE billing_sessions
      SET copay_collected = CASE WHEN ${paid} THEN total_cost ELSE 0 END,
          paid_date = ${paid ? paidDate : null}
      WHERE id = ${id} AND insurer_id IS NULL RETURNING id`) as { id: string }[];
    return res.length > 0;
  }
  const all = readJson<StoredSession[]>(SESS_FILE, []);
  const s = all.find((x) => x.id === id);
  if (!s || s.insurerId) return false;
  s.copayCollected = paid ? (s.totalCost || 0) : 0;
  s.paidDate = paid ? paidDate : null;
  writeJson(SESS_FILE, all);
  return true;
}

/** Mark a claim as SUBMITTED to the insurer (or undo). This is the middle state
 *  ahead of payment; it does not affect payouts (only collected money does). */
export async function markSessionBilled(id: string, billed: boolean, billedDate: string | null): Promise<boolean> {
  if (usePostgres) {
    const sql = await pg();
    // Un-billing also clears any paid state — a claim can't be paid but not billed.
    const res = billed
      ? (await sql`UPDATE billing_sessions SET billed_date = ${billedDate} WHERE id = ${id} RETURNING id`) as { id: string }[]
      : (await sql`UPDATE billing_sessions SET billed_date = ${null}, insurance_paid = ${false}, paid_date = ${null} WHERE id = ${id} RETURNING id`) as { id: string }[];
    return res.length > 0;
  }
  const all = readJson<StoredSession[]>(SESS_FILE, []);
  const s = all.find((x) => x.id === id);
  if (!s) return false;
  s.billedDate = billed ? billedDate : null;
  if (!billed) { s.insurancePaid = false; s.paidDate = null; }
  writeJson(SESS_FILE, all);
  return true;
}

/** Mark a claim as PAID/collected (or undo). Marking paid implies it was billed,
 *  so backfill billed_date if it wasn't set. This is what feeds a payout. */
export async function markSessionPaid(id: string, paid: boolean, paidDate: string | null): Promise<boolean> {
  if (usePostgres) {
    const sql = await pg();
    // COALESCE backfills billed_date only when paid (paidDate set); when un-paying
    // we pass null, so COALESCE(billed_date, null) leaves billed_date untouched.
    const res = (await sql`
      UPDATE billing_sessions
      SET insurance_paid = ${paid},
          paid_date = ${paid ? paidDate : null},
          billed_date = COALESCE(billed_date, ${paid ? paidDate : null})
      WHERE id = ${id} RETURNING id`) as { id: string }[];
    return res.length > 0;
  }
  const all = readJson<StoredSession[]>(SESS_FILE, []);
  const s = all.find((x) => x.id === id);
  if (!s) return false;
  s.insurancePaid = paid;
  s.paidDate = paid ? paidDate : null;
  if (paid && !s.billedDate) s.billedDate = paidDate;
  writeJson(SESS_FILE, all);
  return true;
}

/** Edit a logged session (fix a mistake). Updates the money-bearing fields; the
 *  caller resolves the final values (defaulting to the existing ones) so nothing
 *  is wiped. Every view recomputes from sessions, so the fix propagates. */
export async function updateSession(id: string, f: {
  dateOfService: string; insurerId: string | null; totalCost: number;
  copayCollected: number; copayDue: number; billedDate: string | null;
  insurancePaid: boolean; paidDate: string | null; notes: string;
  selfPayStatus?: SelfPayStatus;
  insuranceDisposition?: InsuranceDisposition;
  insuranceCollected?: number | null;
  cptCodes?: string[];
}): Promise<boolean> {
  const selfPayStatus = f.selfPayStatus ?? null;
  const insuranceDisposition = f.insuranceDisposition ?? null;
  const insuranceCollected = f.insuranceCollected ?? null;
  if (usePostgres) {
    const sql = await pg();
    let ok = false;
    try {
      const res = (await sql`
        UPDATE billing_sessions SET
          date_of_service = ${f.dateOfService}, insurer_id = ${f.insurerId},
          total_cost = ${f.totalCost}, copay_collected = ${f.copayCollected}, copay_due = ${f.copayDue},
          self_pay_status = ${selfPayStatus},
          billed_date = ${f.billedDate}, insurance_paid = ${f.insurancePaid}, paid_date = ${f.paidDate},
          notes = ${f.notes}
        WHERE id = ${id} RETURNING id`) as { id: string }[];
      ok = res.length > 0;
    } catch {
      // Pre-migration: update without self_pay_status.
      const res = (await sql`
        UPDATE billing_sessions SET
          date_of_service = ${f.dateOfService}, insurer_id = ${f.insurerId},
          total_cost = ${f.totalCost}, copay_collected = ${f.copayCollected}, copay_due = ${f.copayDue},
          billed_date = ${f.billedDate}, insurance_paid = ${f.insurancePaid}, paid_date = ${f.paidDate},
          notes = ${f.notes}
        WHERE id = ${id} RETURNING id`) as { id: string }[];
      ok = res.length > 0;
    }
    // Replace the service (CPT) codes if the caller changed them.
    if (ok && f.cptCodes) {
      await sql`DELETE FROM billing_session_cpt WHERE session_id = ${id}`;
      for (const code of f.cptCodes) {
        await sql`INSERT INTO billing_session_cpt (session_id, code) VALUES (${id}, ${code}) ON CONFLICT DO NOTHING`;
      }
    }
    if (ok) await writeInsuranceAdjust(sql, id, insuranceDisposition, insuranceCollected);
    return ok;
  }
  const all = readJson<StoredSession[]>(SESS_FILE, []);
  const s = all.find((x) => x.id === id);
  if (!s) return false;
  s.dateOfService = f.dateOfService; s.insurerId = f.insurerId; s.totalCost = f.totalCost;
  s.copayCollected = f.copayCollected; s.copayDue = f.copayDue; s.selfPayStatus = selfPayStatus;
  s.billedDate = f.billedDate; s.insurancePaid = f.insurancePaid; s.paidDate = f.paidDate; s.notes = f.notes;
  s.insuranceDisposition = insuranceDisposition; s.insuranceCollected = insuranceCollected;
  if (f.cptCodes) s.cptCodes = f.cptCodes;
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
