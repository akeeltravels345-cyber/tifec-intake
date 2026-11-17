// Free Online Consultation funnel: of everyone who booked a free intro consult,
// how many were verified leads (the consult held — booked / confirmed / seen,
// i.e. not cancelled or a no-show), and how many of those became paying clients
// (they have a billing session with cash actually collected). People are counted
// once each, matched to billing by their client-hub id (name as a fallback).
//
// Reads scheduling + billing; deliberately kept out of schedulingStats so that
// the scheduling layer doesn't depend on billing.
import { listAppointments, listAppointmentTypes, type Appointment, type AppointmentType } from "./scheduling";
import { listSessions, type BillingSession } from "./billing";
import { collectedAtVisit, insuranceCash } from "./billingCalc";
import { caymanYearMonth } from "./caymanTime";

export interface ConsultFunnel {
  consults: number;       // distinct people who booked a free consult
  verifiedLeads: number;  // of those, whose consult held (booked / confirmed / seen)
  converted: number;      // of the verified leads, who have cash collected in billing
  bookings: number;       // raw consult bookings (appointments), for context
  leadRate: number;       // verifiedLeads / consults, %
  convRate: number;       // converted / verifiedLeads, %
}
export interface ConsultFunnelReport {
  allTime: ConsultFunnel;
  month: ConsultFunnel;
}

const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
const HELD = new Set(["booked", "confirmed", "seen"]); // a consult that didn't cancel / no-show
const isConsultType = (t: AppointmentType) => /free\s*online\s*consultation/i.test(t.name);
const sessionCollected = (s: BillingSession) => collectedAtVisit(s) + (insuranceCash(s) || 0);
const monthKeyOf = (iso: string) => { const { year, month } = caymanYearMonth(new Date(iso)); return `${year}-${String(month).padStart(2, "0")}`; };
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

function buildFunnel(consultAppts: Appointment[], paidClientIds: Set<string>, paidNames: Set<string>): ConsultFunnel {
  // Collapse to one record per person (a person could book more than one consult).
  const people = new Map<string, { clientId: string | null; name: string; held: boolean }>();
  for (const a of consultAppts) {
    const name = norm(a.clientName);
    const key = a.clientId || (a.clientEmail ? `e:${norm(a.clientEmail)}` : name ? `n:${name}` : "");
    if (!key) continue;
    const rec = people.get(key) || { clientId: a.clientId, name, held: false };
    if (!rec.clientId && a.clientId) rec.clientId = a.clientId;
    if (!rec.name && name) rec.name = name;
    if (HELD.has(a.status)) rec.held = true;
    people.set(key, rec);
  }
  const all = [...people.values()];
  const verified = all.filter((p) => p.held);
  const converted = verified.filter((p) => (p.clientId && paidClientIds.has(p.clientId)) || (p.name && paidNames.has(p.name)));
  return {
    consults: all.length,
    verifiedLeads: verified.length,
    converted: converted.length,
    bookings: consultAppts.length,
    leadRate: pct(verified.length, all.length),
    convRate: pct(converted.length, verified.length),
  };
}

export async function consultFunnel(year: number, month: number): Promise<ConsultFunnelReport> {
  let appts: Appointment[] = [], types: AppointmentType[] = [], sessions: BillingSession[] = [];
  try { [appts, types, sessions] = await Promise.all([listAppointments({}), listAppointmentTypes(), listSessions()]); }
  catch { /* leave empties -> a zeroed funnel */ }

  const consultTypeIds = new Set(types.filter(isConsultType).map((t) => t.id));
  const consultAppts = appts.filter((a) => a.kind === "appointment" && a.typeId && consultTypeIds.has(a.typeId));

  // Who has actually paid: anyone with a billing session where cash was collected
  // (co-pay / self-pay at the visit, or an insurer settlement). Matched later by
  // client-hub id, with the person's name as a fallback for un-linked records.
  const paidClientIds = new Set<string>();
  const paidNames = new Set<string>();
  for (const s of sessions) {
    if (sessionCollected(s) <= 0) continue;
    if (s.clientId) paidClientIds.add(s.clientId);
    const n = norm(`${s.clientFirst} ${s.clientLast}`);
    if (n) paidNames.add(n);
  }

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const inMonth = consultAppts.filter((a) => monthKeyOf(a.startAt) === monthKey);

  return {
    allTime: buildFunnel(consultAppts, paidClientIds, paidNames),
    month: buildFunnel(inMonth, paidClientIds, paidNames),
  };
}
