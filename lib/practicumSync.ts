// De-identified practicum roster feed.
//
// A practicum clinician (currently only Nick) tracks their unpaid caseload for
// coursework in a separate practicum dashboard. That dashboard is a browser-only
// app with no server and no encryption at rest, so it must never receive PHI.
// This module is the boundary: it reads the clinician's real billing roster and
// emits only what a case presentation actually needs.
//
// What crosses the boundary:  opaque ref, age, sex, ICD-10 dx, session dates
//                             and durations.
// What never does:            name, DOB, address, phone, email, member IDs,
//                             insurer, money, notes.
//
// Session dates are included because the practicum hour log is date-based. That
// makes this a LIMITED DATA SET, not a Safe Harbor de-identification (Safe
// Harbor would allow year only). Treat the feed accordingly.

import crypto from "crypto";
import { listClients } from "./clients";
import { listSessions } from "./billing";
import { getClinician } from "./clinicians";
import { ICD10 } from "./icd10";

export const PRACTICUM_FEED_VERSION = 1;

/** One client, stripped to what a case presentation needs. */
export interface PracticumRosterClient {
  ref: string;               // billing client id — an opaque random id, not derived from PHI
  ageYears: number | null;   // 90+ collapsed to 90 (Safe Harbor); null when DOB unknown
  ageCapped: boolean;        // true when the real age was 90 or over
  sex: "M" | "F" | "U" | null;
  diagnosisCodes: string[];  // ICD-10 codes
  diagnosisLabel: string;    // human-readable, e.g. "Generalized anxiety disorder"
  sessionCount: number;
  firstSessionDate: string | null;
  lastSessionDate: string | null;
  totalHours: number;        // sum of durationHours, for Direct Hours
}

export interface PracticumRosterFeed {
  version: number;
  generatedAt: string;
  clinicianId: string;
  clients: PracticumRosterClient[];
}

const DX = new Map(ICD10.map((c) => [c.code, c.description]));

/** Whole years between a DOB and now; null if the DOB is missing or unparseable. */
function ageFromDob(dob: string | undefined): number | null {
  if (!dob) return null;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

function labelFor(codes: string[]): string {
  const named = codes.map((c) => DX.get(c)).filter(Boolean) as string[];
  return named.length > 0 ? named.join("; ") : codes.join("; ");
}

/**
 * Build the de-identified roster for one practicum clinician.
 * Throws if the clinician isn't flagged `practicum` — this feed is not a
 * general-purpose export and must not be pointed at a paid caseload.
 */
export async function buildPracticumRoster(clinicianId: string): Promise<PracticumRosterFeed> {
  const clinician = getClinician(clinicianId);
  if (!clinician) throw new Error("Unknown clinician.");
  if (!clinician.practicum) throw new Error("Not a practicum clinician.");

  const [clients, sessions] = await Promise.all([
    listClients(clinicianId),
    listSessions({ clinicianId }),
  ]);

  // Sessions grouped by client, so a client's hours come only from their own rows.
  const byClient = new Map<string, { dates: string[]; hours: number }>();
  for (const s of sessions) {
    if (!s.clientId) continue;
    const entry = byClient.get(s.clientId) ?? { dates: [], hours: 0 };
    entry.dates.push(s.dateOfService);
    entry.hours += s.durationHours;
    byClient.set(s.clientId, entry);
  }

  const out: PracticumRosterClient[] = clients.map((c) => {
    const agg = byClient.get(c.id);
    const dates = (agg?.dates ?? []).slice().sort();
    const rawAge = ageFromDob(c.profile.dob);
    const codes = c.profile.diagnosis ?? [];
    return {
      ref: c.id,
      ageYears: rawAge === null ? null : Math.min(rawAge, 90),
      ageCapped: rawAge !== null && rawAge >= 90,
      sex: c.profile.sex ?? null,
      diagnosisCodes: codes,
      diagnosisLabel: labelFor(codes),
      sessionCount: dates.length,
      firstSessionDate: dates[0] ?? null,
      lastSessionDate: dates[dates.length - 1] ?? null,
      totalHours: Math.round((agg?.hours ?? 0) * 100) / 100,
    };
  });

  return {
    version: PRACTICUM_FEED_VERSION,
    generatedAt: new Date().toISOString(),
    clinicianId,
    clients: out,
  };
}

// ---------------------------------------------------------------------------
// Sync tokens
//
// The dashboard is a different origin (and, as a standalone file, has no origin
// at all), so the session cookie can't reach this feed. Instead the clinician
// copies a long-lived bearer token into the dashboard's settings. The token is
// an HMAC over the clinician id, so it needs no table of its own and is revoked
// by rotating PRACTICUM_SYNC_SECRET.
// ---------------------------------------------------------------------------

function syncSecret(): string {
  const s = process.env.PRACTICUM_SYNC_SECRET;
  if (!s || s.length < 32) {
    throw new Error("PRACTICUM_SYNC_SECRET must be set (32+ chars). Generate with: openssl rand -hex 32");
  }
  return s;
}

function sign(payloadB64: string): string {
  return crypto.createHmac("sha256", syncSecret()).update(payloadB64).digest("base64url");
}

export function createSyncToken(clinicianId: string): string {
  const payloadB64 = Buffer.from(JSON.stringify({ cid: clinicianId })).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

/** The clinician id a token vouches for, or null if it doesn't verify. */
export function verifySyncToken(token: string): string | null {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const { cid } = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    return typeof cid === "string" && cid ? cid : null;
  } catch {
    return null;
  }
}
