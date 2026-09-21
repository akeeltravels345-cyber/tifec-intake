// =============================================================================
// Waitlist auto-fill. When a booking is cancelled, the freed slot is offered to
// every matching waitlisted client at once by email. Each gets a one-tap claim
// link; the first to confirm wins the slot (an atomic status flip guards the
// race) and the rest are told it's gone but stay on the list.
//
//   Postgres: scheduling_offers   Local: data/scheduling-offers.local.json
// All DB access is guarded, so before the table is migrated the feature simply
// does nothing (a cancellation still cancels fine).
// =============================================================================

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { type AppointmentMode, type Appointment, listWaitlist } from "@/lib/scheduling";

export interface WaitOffer {
  id: string;
  clinicianId: string;
  typeId: string | null;
  startAt: string;
  endAt: string;
  mode: AppointmentMode;
  locationHint: string;
  status: "open" | "claimed" | "expired";
  claimedEntryId: string | null;
  claimedApptId: string | null;
  notifiedEntryIds: string[];
  createdAt: string;
  expiresAt: string; // not honoured past this (defaults to the slot start)
}

const usePostgres = !!process.env.DATABASE_URL;
async function pg() { const { neon } = await import("@neondatabase/serverless"); return neon(process.env.DATABASE_URL as string); }
const FILE = "scheduling-offers.local.json";
const dir = (f: string) => path.join(process.cwd(), "data", f);
function readJson<T>(file: string, fallback: T): T { try { return JSON.parse(fs.readFileSync(dir(file), "utf8")) as T; } catch { return fallback; } }
function writeJson(file: string, data: unknown) { fs.mkdirSync(path.dirname(dir(file)), { recursive: true }); fs.writeFileSync(dir(file), JSON.stringify(data, null, 2)); }
const str = (v: unknown) => (v == null ? "" : String(v));
const randomId = () => crypto.randomBytes(9).toString("base64url");

function rowToOffer(r: Record<string, unknown>): WaitOffer {
  const notified = typeof r.notified_entry_ids === "string" ? (() => { try { return JSON.parse(r.notified_entry_ids as string); } catch { return []; } })() : r.notified_entry_ids;
  return {
    id: str(r.id), clinicianId: str(r.clinician_id), typeId: r.type_id ? str(r.type_id) : null,
    startAt: str(r.start_at), endAt: str(r.end_at), mode: (str(r.mode) || "in_person") as AppointmentMode,
    locationHint: str(r.location_hint), status: (str(r.status) || "open") as WaitOffer["status"],
    claimedEntryId: r.claimed_entry_id ? str(r.claimed_entry_id) : null,
    claimedApptId: r.claimed_appt_id ? str(r.claimed_appt_id) : null,
    notifiedEntryIds: Array.isArray(notified) ? notified.map(str) : [],
    createdAt: str(r.created_at), expiresAt: str(r.expires_at),
  };
}

async function insertOffer(o: WaitOffer): Promise<void> {
  if (usePostgres) {
    const sql = await pg();
    await sql`INSERT INTO scheduling_offers
      (id, clinician_id, type_id, start_at, end_at, mode, location_hint, status, notified_entry_ids, created_at, expires_at)
      VALUES (${o.id}, ${o.clinicianId}, ${o.typeId}, ${o.startAt}, ${o.endAt}, ${o.mode}, ${o.locationHint}, ${o.status},
        ${JSON.stringify(o.notifiedEntryIds)}::jsonb, ${o.createdAt}, ${o.expiresAt})`;
  } else {
    const all = readJson<WaitOffer[]>(FILE, []); all.push(o); writeJson(FILE, all);
  }
}

export async function getOffer(id: string): Promise<WaitOffer | null> {
  if (!id) return null;
  try {
    if (usePostgres) { const sql = await pg(); const r = (await sql`SELECT * FROM scheduling_offers WHERE id=${id}`) as Record<string, unknown>[]; return r[0] ? rowToOffer(r[0]) : null; }
    return readJson<WaitOffer[]>(FILE, []).find((o) => o.id === id) ?? null;
  } catch { return null; }
}

/** Atomically move an open offer to "claimed" for one entry. Returns true only
 *  for the caller that actually flipped it (everyone else lost the race). */
export async function winOffer(id: string, entryId: string): Promise<boolean> {
  if (usePostgres) {
    const sql = await pg();
    const res = (await sql`UPDATE scheduling_offers SET status='claimed', claimed_entry_id=${entryId}
      WHERE id=${id} AND status='open' RETURNING id`) as unknown[];
    return res.length > 0;
  }
  const all = readJson<WaitOffer[]>(FILE, []);
  const i = all.findIndex((o) => o.id === id);
  if (i < 0 || all[i].status !== "open") return false;
  all[i].status = "claimed"; all[i].claimedEntryId = entryId; writeJson(FILE, all);
  return true;
}

/** Record the booked appointment on a claimed offer (best-effort). */
export async function setOfferAppt(id: string, apptId: string): Promise<void> {
  try {
    if (usePostgres) { const sql = await pg(); await sql`UPDATE scheduling_offers SET claimed_appt_id=${apptId} WHERE id=${id}`; return; }
    const all = readJson<WaitOffer[]>(FILE, []); const i = all.findIndex((o) => o.id === id); if (i >= 0) { all[i].claimedApptId = apptId; writeJson(FILE, all); }
  } catch { /* non-fatal */ }
}

// ---- Claim token: opaque, signed, carries the offer + which waitlister -------
const secret = () => process.env.CALENDAR_FEED_SECRET || process.env.SESSION_SECRET || "";
function sign(payload: string): string { return crypto.createHmac("sha256", secret() || "x").update(`claim:${payload}`).digest("base64url").slice(0, 32); }

export function claimToken(offerId: string, entryId: string): string {
  const payload = Buffer.from(`${offerId}.${entryId}`).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readClaimToken(token: string): { offerId: string; entryId: string } | null {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  try { if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null; } catch { return null; }
  const [offerId, entryId] = Buffer.from(payload, "base64url").toString("utf8").split(".");
  if (!offerId || !entryId) return null;
  return { offerId, entryId };
}

/** Waitlisters who match a freed slot: same clinician (or "any" clinician) and
 *  same service (or "any" service), still waiting. Oldest first (fairness). */
export async function matchingWaiters(clinicianId: string, typeId: string | null) {
  const list = await listWaitlist(false); // waiting + offered only
  return list.filter((w) => w.status === "waiting"
    && (!w.clinicianId || w.clinicianId === clinicianId)
    && (!w.typeId || !typeId || w.typeId === typeId)
    && !!w.email);
}

/** Create the offer row for a freed slot and mark matched entries "offered".
 *  Returns the offer plus each matched entry's personal claim token, so the
 *  caller can send the emails. Returns null when nobody matches. */
export async function createOfferForSlot(a: Pick<Appointment, "clinicianId" | "typeId" | "startAt" | "endAt" | "mode" | "locationOrLink">, matched: { id: string }[]): Promise<{ offer: WaitOffer; tokens: { entryId: string; token: string }[] } | null> {
  if (!matched.length) return null;
  const offer: WaitOffer = {
    id: randomId(), clinicianId: a.clinicianId, typeId: a.typeId, startAt: a.startAt, endAt: a.endAt,
    mode: a.mode, locationHint: a.locationOrLink || "", status: "open",
    claimedEntryId: null, claimedApptId: null, notifiedEntryIds: matched.map((m) => m.id),
    createdAt: new Date().toISOString(), expiresAt: a.startAt,
  };
  try { await insertOffer(offer); } catch { return null; } // table not migrated yet
  const tokens = matched.map((m) => ({ entryId: m.id, token: claimToken(offer.id, m.id) }));
  return { offer, tokens };
}
