// Staging store for externally-imported records (e.g. the PRC unpaid-services
// report). Records sit here until the biller reviews and accepts them, at which
// point they become real billing sessions. Dual-mode: Postgres in prod, a
// gitignored JSON file in local dev — same pattern as the other stores.
import fs from "fs";
import path from "path";
import { randomId } from "./crypto";

export type StagedStatus = "pending" | "accepted" | "rejected";

export interface StagedRecord {
  id: string;
  batch: string;
  clinicianId: string;
  clientFirst: string;
  clientLast: string;
  dob: string;
  insurerName: string;
  cpt: string;
  fee: number;
  durationHours: number;
  dateOfService: string; // YYYY-MM-DD
  billedDate: string;    // YYYY-MM-DD ("" = not billed)
  invNo: string;
  status: StagedStatus;
  createdAt: string;
}

export type StagedInput = Omit<StagedRecord, "id" | "status" | "createdAt" | "batch">;

const usePostgres = !!process.env.DATABASE_URL;
async function pg() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.DATABASE_URL as string);
}
const LOCAL_FILE = path.join(process.cwd(), "data", "import-staging.local.json");
function readLocal(): StagedRecord[] {
  try { return JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8")); } catch { return []; }
}
function writeLocal(rows: StagedRecord[]) {
  fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(rows, null, 2));
}

function rowToRecord(r: Record<string, unknown>): StagedRecord {
  return {
    id: String(r.id), batch: String(r.batch), clinicianId: String(r.clinician_id),
    clientFirst: String(r.client_first ?? ""), clientLast: String(r.client_last ?? ""),
    dob: String(r.dob ?? ""), insurerName: String(r.insurer_name ?? ""),
    cpt: String(r.cpt ?? ""), fee: Number(r.fee ?? 0), durationHours: Number(r.duration_hours ?? 1),
    dateOfService: String(r.date_of_service ?? ""), billedDate: String(r.billed_date ?? ""),
    invNo: String(r.inv_no ?? ""), status: (String(r.status ?? "pending") as StagedStatus),
    createdAt: String(r.created_at ?? ""),
  };
}

/** How many records a batch already has (so a load is idempotent). */
export async function batchCount(batch: string): Promise<number> {
  try {
    if (usePostgres) {
      const sql = await pg();
      const r = (await sql`SELECT count(*)::int AS n FROM billing_import_staging WHERE batch = ${batch}`) as { n: number }[];
      return r[0]?.n ?? 0;
    }
    return readLocal().filter((x) => x.batch === batch).length;
  } catch { return 0; } // table not migrated yet
}

/** Insert a batch of staged rows (all pending). */
export async function addStagedBatch(batch: string, rows: StagedInput[], createdAt: string): Promise<number> {
  const records: StagedRecord[] = rows.map((r) => ({ ...r, id: randomId(), status: "pending", batch, createdAt }));
  if (usePostgres) {
    const sql = await pg();
    for (const r of records) {
      await sql`INSERT INTO billing_import_staging
        (id, batch, clinician_id, client_first, client_last, dob, insurer_name, cpt, fee, duration_hours, date_of_service, billed_date, inv_no, status, created_at)
        VALUES (${r.id}, ${r.batch}, ${r.clinicianId}, ${r.clientFirst}, ${r.clientLast}, ${r.dob}, ${r.insurerName}, ${r.cpt}, ${r.fee}, ${r.durationHours}, ${r.dateOfService}, ${r.billedDate}, ${r.invNo}, ${r.status}, ${r.createdAt})`;
    }
    return records.length;
  }
  const all = readLocal();
  all.push(...records);
  writeLocal(all);
  return records.length;
}

/** List staged records, optionally filtered by status. Newest service first. */
export async function listStaged(status?: StagedStatus): Promise<StagedRecord[]> {
  try {
    if (usePostgres) {
      const sql = await pg();
      const res = (status
        ? await sql`SELECT * FROM billing_import_staging WHERE status = ${status} ORDER BY client_last, date_of_service`
        : await sql`SELECT * FROM billing_import_staging ORDER BY client_last, date_of_service`) as Record<string, unknown>[];
      return res.map(rowToRecord);
    }
    return readLocal().filter((r) => !status || r.status === status)
      .sort((a, b) => a.clientLast.localeCompare(b.clientLast) || a.dateOfService.localeCompare(b.dateOfService));
  } catch { return []; } // table not migrated yet — show an empty queue, never crash
}

export async function getStaged(id: string): Promise<StagedRecord | null> {
  if (usePostgres) {
    const sql = await pg();
    const r = (await sql`SELECT * FROM billing_import_staging WHERE id = ${id}`) as Record<string, unknown>[];
    return r[0] ? rowToRecord(r[0]) : null;
  }
  return readLocal().find((x) => x.id === id) ?? null;
}

/** Edit a staged record's fields (the biller correcting something). */
export async function updateStaged(id: string, patch: Partial<StagedInput>): Promise<boolean> {
  if (usePostgres) {
    const cur = await getStaged(id);
    if (!cur) return false;
    const n = { ...cur, ...patch };
    const sql = await pg();
    await sql`UPDATE billing_import_staging SET
      client_first=${n.clientFirst}, client_last=${n.clientLast}, dob=${n.dob}, insurer_name=${n.insurerName},
      cpt=${n.cpt}, fee=${n.fee}, duration_hours=${n.durationHours}, date_of_service=${n.dateOfService},
      billed_date=${n.billedDate}, inv_no=${n.invNo} WHERE id=${id}`;
    return true;
  }
  const all = readLocal();
  const i = all.findIndex((x) => x.id === id);
  if (i < 0) return false;
  all[i] = { ...all[i], ...patch };
  writeLocal(all);
  return true;
}

export async function setStagedStatus(id: string, status: StagedStatus): Promise<boolean> {
  if (usePostgres) {
    const sql = await pg();
    const r = (await sql`UPDATE billing_import_staging SET status=${status} WHERE id=${id} RETURNING id`) as { id: string }[];
    return r.length > 0;
  }
  const all = readLocal();
  const i = all.findIndex((x) => x.id === id);
  if (i < 0) return false;
  all[i].status = status;
  writeLocal(all);
  return true;
}
