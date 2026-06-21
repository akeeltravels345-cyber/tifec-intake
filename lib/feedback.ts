// Clinician-submitted issue reports ("Report an issue").
//  • Production: Postgres (DATABASE_URL) - table `feedback`.
//  • Local dev: data/feedback.local.json.
// No client PHI is expected here - it's clinician feedback about the app.

import fs from "fs";
import path from "path";
import { randomId } from "./crypto";

export interface FeedbackRow {
  id: string;
  clinician_id: string;
  category: string;
  message: string;
  created_at: string; // ISO
}

const usePostgres = !!process.env.DATABASE_URL;

async function pgClient() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.DATABASE_URL as string);
}

const LOCAL_FILE = path.join(process.cwd(), "data", "feedback.local.json");

export async function insertFeedback(category: string, message: string, clinicianId: string): Promise<FeedbackRow> {
  const row: FeedbackRow = {
    id: randomId(),
    clinician_id: clinicianId,
    category,
    message,
    created_at: new Date().toISOString(),
  };
  if (usePostgres) {
    const sql = await pgClient();
    await sql`
      INSERT INTO feedback (id, clinician_id, category, message, created_at)
      VALUES (${row.id}, ${row.clinician_id}, ${row.category}, ${row.message}, ${row.created_at})
    `;
    return row;
  }
  let rows: FeedbackRow[] = [];
  try {
    rows = JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"));
  } catch {
    rows = [];
  }
  rows.push(row);
  fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(rows, null, 2));
  return row;
}

export async function listFeedback(limit = 50): Promise<FeedbackRow[]> {
  if (usePostgres) {
    const sql = await pgClient();
    return (await sql`SELECT * FROM feedback ORDER BY created_at DESC LIMIT ${limit}`) as FeedbackRow[];
  }
  try {
    const rows: FeedbackRow[] = JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"));
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  } catch {
    return [];
  }
}
