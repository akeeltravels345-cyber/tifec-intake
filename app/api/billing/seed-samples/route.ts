import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { billingRoleOf, isOwner } from "@/lib/billingRole";
import { insertSession, listSessions, deleteSession } from "@/lib/billing";
import { resolveClient, listSampleClients, deleteClient } from "@/lib/clients";

// Owner-only demo data: a handful of clearly-fake clients spread across the
// practising clinicians (including Sofia) with claims at each lifecycle stage —
// so the biller's screens can be seen populated. Every one is flagged
// profile.sample so DELETE removes them cleanly without touching real clients.

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

interface Sample {
  first: string; last: string; clinicianId: string; insurerId: string;
  dob: string; sex: "M" | "F"; dx: string[]; memberId: string; code: string; fee: number;
  stage: "tobill" | "awaiting" | "paid";
}

const SAMPLES: Sample[] = [
  { first: "Ada",   last: "Sample-Rivers",  clinicianId: "donnet-oconnor", insurerId: "ins-cinico",      dob: "1990-04-12", sex: "F", dx: ["F41.1"], memberId: "SMP-1001", code: "90837", fee: 211.77, stage: "paid" },
  { first: "Ben",   last: "Sample-Wren",    clinicianId: "donnet-oconnor", insurerId: "ins-britcay",     dob: "1985-09-03", sex: "M", dx: ["F32.1"], memberId: "SMP-1002", code: "90834", fee: 160.0,  stage: "awaiting" },
  { first: "Cara",  last: "Sample-Ivy",     clinicianId: "sofia-hamilton", insurerId: "ins-aetna",       dob: "2011-01-22", sex: "F", dx: ["F90.0"], memberId: "SMP-1003", code: "90791", fee: 276.51, stage: "tobill" },
  { first: "Dev",   last: "Sample-Reed",    clinicianId: "sofia-hamilton", insurerId: "ins-cinico",      dob: "2009-06-30", sex: "M", dx: ["F80.9"], memberId: "SMP-1004", code: "90837", fee: 211.77, stage: "paid" },
  { first: "Elle",  last: "Sample-Fern",    clinicianId: "shion-oconnor",  insurerId: "ins-caymanfirst", dob: "1978-11-15", sex: "F", dx: ["F43.1"], memberId: "SMP-1005", code: "90837", fee: 211.77, stage: "awaiting" },
  { first: "Finn",  last: "Sample-Sage",    clinicianId: "joan-latty",     insurerId: "ins-cinico",      dob: "1995-02-08", sex: "M", dx: ["F33.1"], memberId: "SMP-1006", code: "90847", fee: 240.0,  stage: "tobill" },
];

export async function POST() {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isOwner(billingRoleOf(me))) return NextResponse.json({ error: "Only the owner can add sample data." }, { status: 403 });

  const now = new Date();
  let created = 0;
  for (const s of SAMPLES) {
    const clientId = await resolveClient(s.clinicianId, {
      first: s.first, last: s.last, insurerId: s.insurerId,
      profile: { dob: s.dob, sex: s.sex, diagnosis: s.dx, insurance: { memberId: s.memberId, relationship: "self" }, sample: true },
    });
    const dos = iso(new Date(now.getTime() - (5 + created) * DAY));
    const billedDate = s.stage === "tobill" ? null : iso(new Date(now.getTime() - 2 * DAY));
    const paid = s.stage === "paid";
    await insertSession({
      clinicianId: s.clinicianId, createdBy: me.id, clientFirst: s.first, clientLast: s.last, clientId,
      insurerId: s.insurerId, dateOfService: dos, cptCodes: [s.code], durationHours: 1,
      totalCost: s.fee, copayCollected: 0, notes: "Sample data",
      billedDate, insurancePaid: paid, paidDate: paid ? iso(new Date(now.getTime() - 1 * DAY)) : null,
    });
    created++;
  }
  return NextResponse.json({ ok: true, created });
}

export async function DELETE() {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isOwner(billingRoleOf(me))) return NextResponse.json({ error: "Only the owner can remove sample data." }, { status: 403 });

  const samples = await listSampleClients();
  const ids = new Set(samples.map((c) => c.id));
  const sessions = await listSessions();
  let removedSessions = 0;
  for (const s of sessions) {
    if (s.clientId && ids.has(s.clientId)) { await deleteSession(s.id); removedSessions++; }
  }
  for (const c of samples) await deleteClient(c.id);
  return NextResponse.json({ ok: true, removedClients: samples.length, removedSessions });
}
