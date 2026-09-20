import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { isSystemAdmin } from "@/lib/clinicians";
import { runInvoiceStyleMigration } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-time, admin-only, idempotent migration for invoice-style payers. It runs
// against the app's OWN database connection, so it always targets the real
// production DB. Safe to run repeatedly (ADD COLUMN IF NOT EXISTS + a scoped
// UPDATE). GET so an admin can trigger it straight from the browser.
async function run() {
  const me = await getCurrentClinician();
  if (!me || !isSystemAdmin(me)) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  const result = await runInvoiceStyleMigration();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET() { return run(); }
export async function POST() { return run(); }
