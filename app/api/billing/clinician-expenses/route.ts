import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { resolveClinicianExpenses, saveClinicianExpenses, type ClinicianExpense } from "@/lib/clinicianExpenses";

// A clinician's own private expenses. Always scoped to the signed-in person —
// nobody (owner or biller included) reads or writes another clinician's list.

export async function GET(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const url = new URL(req.url);
  const now = new Date();
  const year = Number(url.searchParams.get("y")) || now.getUTCFullYear();
  const month = Number(url.searchParams.get("m")) || now.getUTCMonth() + 1;
  const res = await resolveClinicianExpenses(me.id, year, month);
  return NextResponse.json(res);
}

export async function POST(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const month = String(body.month ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "A valid month is required." }, { status: 400 });

  const raw = Array.isArray(body.expenses) ? body.expenses : [];
  const expenses = raw.slice(0, 100).map((e) => {
    const o = e as Partial<ClinicianExpense>;
    return { id: String(o.id ?? ""), name: String(o.name ?? ""), amount: Number(o.amount) || 0, kind: o.kind === "oneoff" ? "oneoff" : "running" } as ClinicianExpense;
  });

  const saved = await saveClinicianExpenses(me.id, month, expenses);
  return NextResponse.json({ ok: true, expenses: saved });
}
