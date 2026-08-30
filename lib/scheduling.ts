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

// =============================================================================
// Availability — per-clinician bookable hours + booking rules.
//   Postgres: scheduling_availability (one row per clinician)
//   Local:    data/scheduling-availability.local.json
// Times are "HH:MM" 24h in Cayman local; the booking page converts for clients.
// =============================================================================

export interface TimeBlock { start: string; end: string; }         // "09:00".."17:00"
export interface DayHours { day: number; blocks: TimeBlock[]; }     // day 0=Sun .. 6=Sat
export interface DateOverride { date: string; closed: boolean; blocks: TimeBlock[]; } // "YYYY-MM-DD"

export interface ClinicianAvailability {
  clinicianId: string;
  weekly: DayHours[];
  overrides: DateOverride[];
  minNoticeHours: number;   // no bookings sooner than this
  bookAheadDays: number;    // how far ahead clients can book
  maxPerDay: number;        // 0 = no limit
  slotIntervalMin: number;  // granularity of offered start times
  updatedAt: string;
}

const AVAIL_FILE = "scheduling-availability.local.json";
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const cleanBlocks = (v: unknown): TimeBlock[] => {
  const raw = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return []; } })() : v;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b: Record<string, unknown>) => ({ start: str(b.start), end: str(b.end) }))
    .filter((b) => HHMM.test(b.start) && HHMM.test(b.end) && b.start < b.end)
    .sort((a, b) => a.start.localeCompare(b.start));
};
const cleanWeekly = (v: unknown): DayHours[] => {
  const raw = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return []; } })() : v;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d: Record<string, unknown>) => ({ day: num(d.day), blocks: cleanBlocks(d.blocks) }))
    .filter((d) => d.day >= 0 && d.day <= 6);
};
const cleanOverrides = (v: unknown): DateOverride[] => {
  const raw = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return []; } })() : v;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o: Record<string, unknown>) => ({ date: str(o.date).slice(0, 10), closed: !!o.closed, blocks: cleanBlocks(o.blocks) }))
    .filter((o) => /^\d{4}-\d{2}-\d{2}$/.test(o.date))
    .sort((a, b) => a.date.localeCompare(b.date));
};

function defaultAvailability(clinicianId: string): ClinicianAvailability {
  return { clinicianId, weekly: [], overrides: [], minNoticeHours: 12, bookAheadDays: 60, maxPerDay: 0, slotIntervalMin: 30, updatedAt: now() };
}

function rowToAvail(r: Record<string, unknown>): ClinicianAvailability {
  return {
    clinicianId: str(r.clinician_id),
    weekly: cleanWeekly(r.weekly), overrides: cleanOverrides(r.overrides),
    minNoticeHours: num(r.min_notice_hours), bookAheadDays: num(r.book_ahead_days),
    maxPerDay: num(r.max_per_day), slotIntervalMin: num(r.slot_interval_min) || 30,
    updatedAt: iso(r.updated_at),
  };
}

export async function getAvailability(clinicianId: string): Promise<ClinicianAvailability> {
  try {
    if (usePostgres) {
      const sql = await pg();
      const res = (await sql`SELECT * FROM scheduling_availability WHERE clinician_id = ${clinicianId}`) as Record<string, unknown>[];
      return res[0] ? rowToAvail(res[0]) : defaultAvailability(clinicianId);
    }
    const row = readJson<ClinicianAvailability[]>(AVAIL_FILE, []).find((a) => a.clinicianId === clinicianId);
    return row ? { ...defaultAvailability(clinicianId), ...row } : defaultAvailability(clinicianId);
  } catch {
    return defaultAvailability(clinicianId);
  }
}

export async function saveAvailability(clinicianId: string, input: Partial<ClinicianAvailability>): Promise<ClinicianAvailability> {
  const base = await getAvailability(clinicianId);
  const row: ClinicianAvailability = {
    clinicianId,
    weekly: input.weekly != null ? cleanWeekly(input.weekly) : base.weekly,
    overrides: input.overrides != null ? cleanOverrides(input.overrides) : base.overrides,
    minNoticeHours: input.minNoticeHours != null ? Math.max(0, num(input.minNoticeHours)) : base.minNoticeHours,
    bookAheadDays: input.bookAheadDays != null ? Math.max(1, num(input.bookAheadDays)) : base.bookAheadDays,
    maxPerDay: input.maxPerDay != null ? Math.max(0, num(input.maxPerDay)) : base.maxPerDay,
    slotIntervalMin: input.slotIntervalMin != null ? Math.max(5, num(input.slotIntervalMin)) : base.slotIntervalMin,
    updatedAt: now(),
  };
  if (usePostgres) {
    const sql = await pg();
    await sql`INSERT INTO scheduling_availability
      (clinician_id, weekly, overrides, min_notice_hours, book_ahead_days, max_per_day, slot_interval_min, updated_at)
      VALUES (${clinicianId}, ${JSON.stringify(row.weekly)}::jsonb, ${JSON.stringify(row.overrides)}::jsonb,
        ${row.minNoticeHours}, ${row.bookAheadDays}, ${row.maxPerDay}, ${row.slotIntervalMin}, ${row.updatedAt})
      ON CONFLICT (clinician_id) DO UPDATE SET
        weekly=EXCLUDED.weekly, overrides=EXCLUDED.overrides, min_notice_hours=EXCLUDED.min_notice_hours,
        book_ahead_days=EXCLUDED.book_ahead_days, max_per_day=EXCLUDED.max_per_day,
        slot_interval_min=EXCLUDED.slot_interval_min, updated_at=EXCLUDED.updated_at`;
  } else {
    const all = readJson<ClinicianAvailability[]>(AVAIL_FILE, []);
    const i = all.findIndex((a) => a.clinicianId === clinicianId);
    if (i >= 0) all[i] = row; else all.push(row);
    writeJson(AVAIL_FILE, all);
  }
  return row;
}

// =============================================================================
// Appointments — the calendar itself.
//   Postgres: scheduling_appointments
//   Local:    data/scheduling-appointments.local.json
// PROTOTYPE ISOLATION: the client is stored by name/email on the appointment;
// we do NOT write to billing_clients or billing_sessions yet. The "seen visit
// -> billing session" bridge stays stubbed (billingSessionId null) until Akeel
// says to connect it, so live intake/billing are never touched.
// =============================================================================

export type AppointmentStatus = "booked" | "confirmed" | "seen" | "cancelled" | "no_show";
export type AppointmentKind = "appointment" | "block";
export type InsurancePath = "self_pay" | "insurance" | null;
export type IntakeStatus = "not_required" | "pending" | "received";

export interface Appointment {
  id: string;
  kind: AppointmentKind;         // "block" = staff personal time, no client
  clientId: string | null;       // reserved for the shared record; null for now
  clientName: string;
  clientEmail: string;
  clinicianId: string;
  typeId: string | null;
  title: string;                 // block label, or a note shown on the calendar
  startAt: string;               // ISO UTC
  endAt: string;                 // ISO UTC
  mode: AppointmentMode;
  locationOrLink: string;
  status: AppointmentStatus;
  insurancePath: InsurancePath;
  insurerId: string | null;
  policyNo: string;
  intakeStatus: IntakeStatus;
  billingSessionId: string | null;
  notes: string;
  createdBy: string;
  source: "staff" | "client";
  createdAt: string;
  updatedAt: string;
}

const APPT_FILE = "scheduling-appointments.local.json";
const STATUSES: AppointmentStatus[] = ["booked", "confirmed", "seen", "cancelled", "no_show"];
const asStatus = (v: unknown): AppointmentStatus => (STATUSES.includes(v as AppointmentStatus) ? (v as AppointmentStatus) : "booked");
const asPath = (v: unknown): InsurancePath => (v === "self_pay" || v === "insurance" ? v : null);
const asIntake = (v: unknown): IntakeStatus => (v === "pending" || v === "received" ? v : "not_required");

function rowToAppt(r: Record<string, unknown>): Appointment {
  return {
    id: str(r.id), kind: r.kind === "block" ? "block" : "appointment",
    clientId: r.client_id ? str(r.client_id) : null, clientName: str(r.client_name), clientEmail: str(r.client_email),
    clinicianId: str(r.clinician_id), typeId: r.type_id ? str(r.type_id) : null, title: str(r.title),
    startAt: iso(r.start_at), endAt: iso(r.end_at), mode: asMode(r.mode), locationOrLink: str(r.location_or_link),
    status: asStatus(r.status), insurancePath: asPath(r.insurance_path), insurerId: r.insurer_id ? str(r.insurer_id) : null,
    policyNo: str(r.policy_no), intakeStatus: asIntake(r.intake_status), billingSessionId: r.billing_session_id ? str(r.billing_session_id) : null,
    notes: str(r.notes), createdBy: str(r.created_by), source: r.source === "client" ? "client" : "staff",
    createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
  };
}

export async function listAppointments(opts: { from?: string; to?: string; clinicianId?: string } = {}): Promise<Appointment[]> {
  let rows: Appointment[];
  try {
    if (usePostgres) {
      const sql = await pg();
      const res = (await sql`SELECT * FROM scheduling_appointments
        WHERE (${opts.from ?? null}::timestamptz IS NULL OR end_at >= ${opts.from ?? null})
          AND (${opts.to ?? null}::timestamptz IS NULL OR start_at < ${opts.to ?? null})
          AND (${opts.clinicianId ?? null}::text IS NULL OR clinician_id = ${opts.clinicianId ?? null})`) as Record<string, unknown>[];
      rows = res.map(rowToAppt);
    } else {
      rows = readJson<Appointment[]>(APPT_FILE, []).filter((a) =>
        (!opts.from || a.endAt >= opts.from) && (!opts.to || a.startAt < opts.to) &&
        (!opts.clinicianId || a.clinicianId === opts.clinicianId));
    }
  } catch {
    return [];
  }
  return rows.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export async function getAppointment(id: string): Promise<Appointment | null> {
  if (usePostgres) {
    const sql = await pg();
    const res = (await sql`SELECT * FROM scheduling_appointments WHERE id = ${id}`) as Record<string, unknown>[];
    return res[0] ? rowToAppt(res[0]) : null;
  }
  return readJson<Appointment[]>(APPT_FILE, []).find((a) => a.id === id) ?? null;
}

type ApptInput = Partial<Omit<Appointment, "id" | "createdAt" | "updatedAt">>;

function normalizeAppt(input: ApptInput, base?: Appointment): Appointment {
  const t = now();
  const b: Appointment = base ?? {
    id: randomId(), kind: "appointment", clientId: null, clientName: "", clientEmail: "", clinicianId: "",
    typeId: null, title: "", startAt: t, endAt: t, mode: "in_person", locationOrLink: "", status: "booked",
    insurancePath: null, insurerId: null, policyNo: "", intakeStatus: "not_required", billingSessionId: null,
    notes: "", createdBy: "", source: "staff", createdAt: t, updatedAt: t,
  };
  return {
    ...b,
    kind: input.kind === "block" ? "block" : (input.kind === "appointment" ? "appointment" : b.kind),
    clientName: input.clientName !== undefined ? str(input.clientName).trim() : b.clientName,
    clientEmail: input.clientEmail !== undefined ? str(input.clientEmail).trim() : b.clientEmail,
    clinicianId: input.clinicianId !== undefined ? str(input.clinicianId) : b.clinicianId,
    typeId: input.typeId !== undefined ? (input.typeId ? str(input.typeId) : null) : b.typeId,
    title: input.title !== undefined ? str(input.title).trim() : b.title,
    startAt: input.startAt !== undefined ? iso(input.startAt) : b.startAt,
    endAt: input.endAt !== undefined ? iso(input.endAt) : b.endAt,
    mode: input.mode !== undefined ? asMode(input.mode) : b.mode,
    locationOrLink: input.locationOrLink !== undefined ? str(input.locationOrLink).trim() : b.locationOrLink,
    status: input.status !== undefined ? asStatus(input.status) : b.status,
    insurancePath: input.insurancePath !== undefined ? asPath(input.insurancePath) : b.insurancePath,
    insurerId: input.insurerId !== undefined ? (input.insurerId ? str(input.insurerId) : null) : b.insurerId,
    policyNo: input.policyNo !== undefined ? str(input.policyNo).trim() : b.policyNo,
    intakeStatus: input.intakeStatus !== undefined ? asIntake(input.intakeStatus) : b.intakeStatus,
    notes: input.notes !== undefined ? str(input.notes) : b.notes,
    createdBy: input.createdBy !== undefined ? str(input.createdBy) : b.createdBy,
    source: input.source === "client" ? "client" : b.source,
    updatedAt: t,
  };
}

async function persistAppt(row: Appointment, isNew: boolean) {
  if (usePostgres) {
    const sql = await pg();
    if (isNew) {
      await sql`INSERT INTO scheduling_appointments
        (id, kind, client_id, client_name, client_email, clinician_id, type_id, title, start_at, end_at, mode,
         location_or_link, status, insurance_path, insurer_id, policy_no, intake_status, billing_session_id, notes,
         created_by, source, created_at, updated_at)
        VALUES (${row.id}, ${row.kind}, ${row.clientId}, ${row.clientName}, ${row.clientEmail}, ${row.clinicianId},
         ${row.typeId}, ${row.title}, ${row.startAt}, ${row.endAt}, ${row.mode}, ${row.locationOrLink}, ${row.status},
         ${row.insurancePath}, ${row.insurerId}, ${row.policyNo}, ${row.intakeStatus}, ${row.billingSessionId}, ${row.notes},
         ${row.createdBy}, ${row.source}, ${row.createdAt}, ${row.updatedAt})`;
    } else {
      await sql`UPDATE scheduling_appointments SET
        kind=${row.kind}, client_id=${row.clientId}, client_name=${row.clientName}, client_email=${row.clientEmail},
        clinician_id=${row.clinicianId}, type_id=${row.typeId}, title=${row.title}, start_at=${row.startAt}, end_at=${row.endAt},
        mode=${row.mode}, location_or_link=${row.locationOrLink}, status=${row.status}, insurance_path=${row.insurancePath},
        insurer_id=${row.insurerId}, policy_no=${row.policyNo}, intake_status=${row.intakeStatus},
        billing_session_id=${row.billingSessionId}, notes=${row.notes}, updated_at=${row.updatedAt}
        WHERE id=${row.id}`;
    }
  } else {
    const all = readJson<Appointment[]>(APPT_FILE, []);
    const i = all.findIndex((a) => a.id === row.id);
    if (i >= 0) all[i] = row; else all.push(row);
    writeJson(APPT_FILE, all);
  }
}

export async function createAppointment(input: ApptInput): Promise<Appointment> {
  const row = normalizeAppt(input);
  await persistAppt(row, true);
  return row;
}

export async function updateAppointment(id: string, input: ApptInput): Promise<Appointment | null> {
  const base = await getAppointment(id);
  if (!base) return null;
  const row = normalizeAppt(input, base);
  await persistAppt(row, false);
  return row;
}

export async function deleteAppointment(id: string): Promise<void> {
  if (usePostgres) {
    const sql = await pg();
    await sql`DELETE FROM scheduling_appointments WHERE id=${id}`;
  } else {
    writeJson(APPT_FILE, readJson<Appointment[]>(APPT_FILE, []).filter((a) => a.id !== id));
  }
}

// =============================================================================
// Booking engine — open slots for the client-facing page. Read-only over
// availability + appointments; Cayman is fixed UTC-5.
// =============================================================================

const CAY_OFFSET = 5;
const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const addDaysStr = (dateStr: string, n: number) => { const [y, m, d] = dateStr.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const utcAtCayMidnightStr = (dateStr: string) => { const [y, m, d] = dateStr.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, CAY_OFFSET, 0)).toISOString(); };
export const utcFromCayMinutes = (dateStr: string, minutes: number) => { const [y, m, d] = dateStr.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, CAY_OFFSET + Math.floor(minutes / 60), minutes % 60)).toISOString(); };
const cayMinutesOf = (iso: string) => { const d = new Date(Date.parse(iso) - CAY_OFFSET * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };

function workingBlocksForAvail(av: ClinicianAvailability, dateStr: string): { s: number; e: number }[] {
  const ov = av.overrides.find((o) => o.date === dateStr);
  if (ov) return ov.closed ? [] : ov.blocks.map((b) => ({ s: toMinutes(b.start), e: toMinutes(b.end) }));
  const [y, m, d] = dateStr.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const dh = av.weekly.find((x) => x.day === wd);
  return dh ? dh.blocks.map((b) => ({ s: toMinutes(b.start), e: toMinutes(b.end) })) : [];
}

/** Open start times (Cayman minutes) for one clinician on one date, honouring
 *  their hours, existing appointments, min-notice, and max-per-day. */
export async function availableSlots(clinicianId: string, dateStr: string, durationMin: number, nowMs = Date.now()): Promise<number[]> {
  const av = await getAvailability(clinicianId);
  const blocks = workingBlocksForAvail(av, dateStr);
  if (!blocks.length) return [];
  const appts = (await listAppointments({ clinicianId, from: utcAtCayMidnightStr(dateStr), to: utcAtCayMidnightStr(addDaysStr(dateStr, 1)) }))
    .filter((a) => a.status !== "cancelled");
  if (av.maxPerDay > 0 && appts.filter((a) => a.kind === "appointment").length >= av.maxPerDay) return [];
  const busy = appts.map((a) => ({ s: cayMinutesOf(a.startAt), e: cayMinutesOf(a.endAt) }));
  const step = av.slotIntervalMin || 30;
  const cutoff = nowMs + av.minNoticeHours * 3600e3;
  const out: number[] = [];
  for (const blk of blocks) {
    for (let t = blk.s; t + durationMin <= blk.e; t += step) {
      const overlaps = busy.some((b) => t < b.e && t + durationMin > b.s);
      if (overlaps) continue;
      if (Date.parse(utcFromCayMinutes(dateStr, t)) < cutoff) continue;
      out.push(t);
    }
  }
  return out;
}

/** For "any available": the open minutes across a set of clinicians, each with
 *  the first free clinician for that time. */
export async function availableSlotsAny(clinicianIds: string[], dateStr: string, durationMin: number, nowMs = Date.now()): Promise<{ minute: number; clinicianId: string }[]> {
  const per = await Promise.all(clinicianIds.map(async (id) => ({ id, mins: new Set(await availableSlots(id, dateStr, durationMin, nowMs)) })));
  const all = new Set<number>();
  per.forEach((p) => p.mins.forEach((m) => all.add(m)));
  return [...all].sort((a, b) => a - b).map((minute) => ({ minute, clinicianId: per.find((p) => p.mins.has(minute))!.id }));
}
