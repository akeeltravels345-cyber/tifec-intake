import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { billingRoleOf, canConfigureBilling } from "@/lib/billingRole";
import { insertSession, listSessions, deleteSession } from "@/lib/billing";
import { resolveClient, listSampleClients, deleteClient, type ClientReferral } from "@/lib/clients";
import { insertSubmission, listSubmissions, deleteSubmission } from "@/lib/db";
import { encrypt, secureToken, randomId } from "@/lib/crypto";

// A full end-to-end DEMO across the system: clearly-fake clients (all surnames
// carry "Sample-"), each with an intake form, a referral (valid / expiring /
// expired), charges at every stage, and co-pay write-offs — so a clinician can
// walk the whole flow. Everything is flagged so it removes cleanly.

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const rel = (now: number, days: number) => iso(new Date(now + days * DAY));

interface Appt { date: string; code: string; fee: number; copayDue: number; copayCollected: number; stage: "tobill" | "awaiting" | "paid"; }
interface Demo {
  first: string; last: string; clinicianId: string; insurerId: string;
  dob: string; sex: "M" | "F"; dx: string[]; memberId: string;
  referral?: (now: number) => ClientReferral;
  appts: (now: number) => Appt[];
}

const DEMO: Demo[] = [
  // Donnet — the walkthrough clinician. Valid referral, all co-pays collected.
  { first: "Ada", last: "Sample-Rivers", clinicianId: "donnet-oconnor", insurerId: "ins-cinico", dob: "1990-04-12", sex: "F", dx: ["F41.1"], memberId: "SMP-1001",
    referral: (n) => ({ source: "Dr. Grace Bodden", authNumber: "REF-1001", startDate: rel(n, -60), endDate: rel(n, 180), sessions: 12 }),
    appts: (n) => [
      { date: rel(n, -20), code: "90791", fee: 276.51, copayDue: 40, copayCollected: 40, stage: "paid" },
      { date: rel(n, -6), code: "90837", fee: 211.77, copayDue: 40, copayCollected: 40, stage: "awaiting" },
      { date: rel(n, -1), code: "90837", fee: 211.77, copayDue: 40, copayCollected: 40, stage: "tobill" },
    ] },
  // Donnet — referral EXPIRING soon + a co-pay NOT collected (write-off this month).
  { first: "Ben", last: "Sample-Wren", clinicianId: "donnet-oconnor", insurerId: "ins-britcay", dob: "1985-09-03", sex: "M", dx: ["F32.1"], memberId: "SMP-1002",
    referral: (n) => ({ source: "Dr. Grace Bodden", authNumber: "REF-1002", startDate: rel(n, -120), endDate: rel(n, 15), sessions: 8 }),
    appts: (n) => [
      { date: rel(n, -10), code: "90834", fee: 160, copayDue: 30, copayCollected: 0, stage: "awaiting" },
      { date: rel(n, -3), code: "90834", fee: 160, copayDue: 30, copayCollected: 15, stage: "tobill" },
    ] },
  // Donnet — referral EXPIRED, with a session AFTER the end date (won't be paid).
  { first: "Cara", last: "Sample-Ivy", clinicianId: "donnet-oconnor", insurerId: "ins-cinico", dob: "2011-01-22", sex: "F", dx: ["F90.0"], memberId: "SMP-1003",
    referral: (n) => ({ source: "Dr. Marcus Ebanks", authNumber: "REF-1003", startDate: rel(n, -200), endDate: rel(n, -14), sessions: 6 }),
    appts: (n) => [
      { date: rel(n, -30), code: "90837", fee: 211.77, copayDue: 40, copayCollected: 40, stage: "paid" },
      { date: rel(n, -2), code: "90837", fee: 211.77, copayDue: 40, copayCollected: 40, stage: "tobill" }, // after referral end
    ] },
  // Sofia — a second clinician, to show the biller's cross-clinician view.
  { first: "Dev", last: "Sample-Reed", clinicianId: "sofia-hamilton", insurerId: "ins-aetna", dob: "2009-06-30", sex: "M", dx: ["F80.9"], memberId: "SMP-1004",
    referral: (n) => ({ source: "Dr. Grace Bodden", authNumber: "REF-1004", startDate: rel(n, -30), endDate: rel(n, 120), sessions: 10 }),
    appts: (n) => [
      { date: rel(n, -8), code: "90791", fee: 276.51, copayDue: 25, copayCollected: 25, stage: "tobill" },
    ] },
  // Shion — self-pay (no insurer), to show a non-insured client.
  { first: "Elle", last: "Sample-Fern", clinicianId: "shion-oconnor", insurerId: "", dob: "1978-11-15", sex: "F", dx: ["F43.1"], memberId: "",
    appts: (n) => [
      { date: rel(n, -5), code: "90837", fee: 211.77, copayDue: 0, copayCollected: 0, stage: "paid" },
    ] },
];

/** Create a matching intake submission so the record links to the intake system. */
async function seedIntake(d: Demo, now: number) {
  const answers = { full_name: `${d.first} ${d.last}`, dob: d.dob, presenting_concern: "Demo intake — sample client.", consent_signature_name: `${d.first} ${d.last}` };
  await insertSubmission({
    id: randomId(), clinician_id: d.clinicianId, token: secureToken(), form_key: "individual",
    couple_id: null, answers_encrypted: encrypt(JSON.stringify(answers)),
    created_at: new Date(now - 25 * DAY).toISOString(), status: "new", notes_encrypted: null,
  });
}

export async function POST() {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!canConfigureBilling(billingRoleOf(me))) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const now = Date.now();
  let created = 0;
  for (const d of DEMO) {
    const referral = d.referral?.(now);
    const clientId = await resolveClient(d.clinicianId, {
      first: d.first, last: d.last, insurerId: d.insurerId || null,
      profile: { dob: d.dob, sex: d.sex, diagnosis: d.dx, insurance: d.memberId ? { memberId: d.memberId, relationship: "self" } : undefined, referral, sample: true },
    });
    await seedIntake(d, now);
    for (const a of d.appts(now)) {
      const billedDate = a.stage === "tobill" ? null : rel(now, -1);
      const paid = a.stage === "paid";
      await insertSession({
        clinicianId: d.clinicianId, createdBy: me.id, clientFirst: d.first, clientLast: d.last, clientId,
        insurerId: d.insurerId || null, dateOfService: a.date, cptCodes: [a.code], durationHours: 1,
        totalCost: a.fee, copayCollected: a.copayCollected, copayDue: a.copayDue, notes: "Sample data",
        billedDate, insurancePaid: paid, paidDate: paid ? rel(now, -1) : null,
      });
    }
    created++;
  }
  return NextResponse.json({ ok: true, created });
}

export async function DELETE() {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!canConfigureBilling(billingRoleOf(me))) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  // Billing: sample clients + their charges.
  const samples = await listSampleClients();
  const ids = new Set(samples.map((c) => c.id));
  const sessions = await listSessions();
  let removedSessions = 0;
  for (const s of sessions) if (s.clientId && ids.has(s.clientId)) { await deleteSession(s.id); removedSessions++; }
  for (const c of samples) await deleteClient(c.id);

  // Intake: the demo submissions (their names carry "Sample-").
  let removedIntake = 0;
  for (const r of await listSubmissions()) {
    let name = "";
    try { name = String((JSON.parse((await import("@/lib/crypto")).decrypt(r.answers_encrypted)) as Record<string, unknown>).full_name ?? ""); } catch { /* skip */ }
    if (name.includes("Sample-")) { if (await deleteSubmission(r.token, null)) removedIntake++; }
  }

  return NextResponse.json({ ok: true, removedClients: samples.length, removedSessions, removedIntake });
}
