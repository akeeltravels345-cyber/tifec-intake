// =============================================================================
// Bulk import of past billing work (biller-only).
// Pure functions, deliberately shared by the preview UI and the API route so
// what the biller sees on screen is exactly what the server will store.
// =============================================================================

/** Minimal CSV reader: handles quoted fields, embedded commas/newlines, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  const src = text.replace(/^﻿/, ""); // strip BOM (Excel exports carry one)
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += c;
  }
  row.push(field);
  rows.push(row);
  // Drop trailing blank lines.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// Header names vary between billing packages, so match on aliases instead of
// forcing the biller to rename his columns.
const ALIASES: Record<string, string[]> = {
  date: ["date", "date of service", "dos", "service date", "visit date", "seen"],
  client: ["client", "client name", "patient", "patient name", "name"],
  first: ["first", "first name", "client first", "given name"],
  last: ["last", "last name", "client last", "surname", "family name"],
  clinician: ["clinician", "provider", "therapist", "doctor", "psychologist", "seen by", "staff"],
  insurer: ["insurer", "insurance", "payer", "payor", "plan", "carrier", "insurance company"],
  total: ["total", "total cost", "amount", "fee", "charge", "charges", "billed amount", "cost"],
  copay: ["copay", "co-pay", "co pay", "copay collected", "patient paid", "client paid", "patient portion"],
  paidDate: ["paid date", "date paid", "paid on", "payment date", "remittance date"],
  billed: ["billed", "status", "paid", "is paid", "insurance paid"],
  notes: ["notes", "note", "comment", "comments", "memo"],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/[_\s]+/g, " ");

export type FieldKey = keyof typeof ALIASES;

/** Map each known field to its column index in the header row (-1 if absent). */
export function mapHeaders(header: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(ALIASES)) {
    out[key] = header.findIndex((h) => ALIASES[key].includes(norm(h)));
  }
  return out;
}

export type DateOrder = "auto" | "ymd" | "dmy" | "mdy";

/** Parse a date to YYYY-MM-DD, or "" if it can't be read confidently. */
export function parseDate(raw: string, order: DateOrder = "auto"): string {
  const s = raw.trim();
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return ymd(+iso[1], +iso[2], +iso[3]);

  const parts = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (parts) {
    let a = +parts[1], b = +parts[2];
    const y = +parts[3] < 100 ? 2000 + +parts[3] : +parts[3];
    let d: number, m: number;
    if (order === "dmy") { d = a; m = b; }
    else if (order === "mdy") { m = a; d = b; }
    else {
      // auto: only trust it when one of the two can't be a month.
      if (a > 12 && b <= 12) { d = a; m = b; }
      else if (b > 12 && a <= 12) { m = a; d = b; }
      else return ""; // genuinely ambiguous - make the biller choose
    }
    return ymd(y, m, d);
  }
  // "12 Jul 2026" / "Jul 12, 2026"
  const t = Date.parse(s);
  if (!isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return "";
}

function ymd(y: number, m: number, d: number): string {
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Read a money cell: strips $, commas, spaces. Returns NaN if unreadable. */
export function parseMoney(raw: string): number {
  const s = raw.replace(/[$,\s]/g, "").trim();
  if (!s) return 0;
  const n = Number(s);
  return isNaN(n) ? NaN : n;
}

const YES = ["yes", "y", "true", "1", "billed", "paid", "complete", "completed", "closed"];
export const isBilledFlag = (raw: string) => YES.includes(norm(raw));

const TITLE = /^(dr|mrs|mr|ms|miss)\.?$/;
/** Name to a sorted set of meaningful words, so word order and titles stop
 *  mattering: "O'Connor, Donnet" and "Dr. Donnet O'Connor" both give
 *  {donnet, o'connor}. */
const tokens = (s: string) =>
  norm(s).replace(/[.,]/g, " ").split(/\s+/).filter((t) => t && !TITLE.test(t)).sort();

/** Match a name against the roster. Returns undefined when nothing matches OR
 *  when it's ambiguous ("O'Connor" with two O'Connors on staff) — guessing
 *  would put a claim, and someone's payout, against the wrong person. */
export function matchName<T extends { id: string; name: string }>(raw: string, list: T[]): T | undefined {
  const c = matchCandidates(raw, list);
  return c.length === 1 ? c[0] : undefined;
}

/** Everyone the name could plausibly mean: 0 = unknown, 1 = a match,
 *  2+ = ambiguous, which the caller should surface rather than guess. */
export function matchCandidates<T extends { id: string; name: string }>(raw: string, list: T[]): T[] {
  const q = norm(raw);
  if (!q) return [];

  const exact = list.find((x) => norm(x.name) === q);
  if (exact) return [exact];

  const qt = tokens(raw);
  if (qt.length === 0) return [];
  const key = (t: string[]) => t.join(" ");

  const sameWords = list.filter((x) => key(tokens(x.name)) === key(qt));
  if (sameWords.length > 0) return sameWords;

  // Fall back to a subset ("Donnet" inside "Dr. Donnet O'Connor").
  return list.filter((x) => {
    const xt = tokens(x.name);
    return qt.every((t) => xt.includes(t)) || xt.every((t) => qt.includes(t));
  });
}

export interface ImportRow {
  line: number;
  clinicianId: string;
  clinicianName: string;
  clientFirst: string;
  clientLast: string;
  insurerId: string | null;
  insurerName: string;
  dateOfService: string;
  totalCost: number;
  copayCollected: number;
  insurancePaid: boolean;
  paidDate: string | null;
  notes: string;
  errors: string[];
}

export interface Ref { id: string; name: string }

/** Turn CSV rows into validated ImportRows. Rows with errors are kept so the
 *  biller can see exactly which line to fix, rather than a silent skip. */
export function buildRows(
  rows: string[][],
  clinicians: Ref[],
  insurers: Ref[],
  dateOrder: DateOrder = "auto",
): ImportRow[] {
  if (rows.length < 2) return [];
  const idx = mapHeaders(rows[0]);
  const cell = (r: string[], i: number) => (i >= 0 && i < r.length ? r[i].trim() : "");

  return rows.slice(1).map((r, n) => {
    const errors: string[] = [];

    // Client name: either one column or separate first/last.
    let first = cell(r, idx.first), last = cell(r, idx.last);
    if (!first && !last) {
      const whole = cell(r, idx.client);
      if (whole.includes(",")) { const [l, f] = whole.split(",", 2); last = l.trim(); first = f.trim(); }
      else { const p = whole.split(/\s+/); first = p[0] ?? ""; last = p.slice(1).join(" "); }
    }
    if (!first && !last) errors.push("No client name");

    const clinRaw = cell(r, idx.clinician);
    const clinOpts = matchCandidates(clinRaw, clinicians);
    const clin = clinOpts.length === 1 ? clinOpts[0] : undefined;
    if (!clinRaw) errors.push("No clinician");
    else if (clinOpts.length > 1) errors.push(`Which one? "${clinRaw}" could be ${clinOpts.map((c) => c.name).join(" or ")}`);
    else if (!clin) errors.push(`Unknown clinician "${clinRaw}"`);

    const insRaw = cell(r, idx.insurer);
    const ins = insRaw ? matchName(insRaw, insurers) : undefined;
    if (insRaw && !ins) errors.push(`Unknown insurer "${insRaw}"`);

    const dateOfService = parseDate(cell(r, idx.date), dateOrder);
    if (!dateOfService) errors.push(cell(r, idx.date) ? `Unclear date "${cell(r, idx.date)}"` : "No date");

    const totalCost = parseMoney(cell(r, idx.total));
    if (isNaN(totalCost)) errors.push(`Unclear amount "${cell(r, idx.total)}"`);
    else if (totalCost <= 0) errors.push("Amount is zero");

    const copayCollected = parseMoney(cell(r, idx.copay));
    if (isNaN(copayCollected)) errors.push(`Unclear co-pay "${cell(r, idx.copay)}"`);
    else if (!isNaN(totalCost) && copayCollected > totalCost) errors.push("Co-pay is more than the total");

    // Billed if there's a paid date, or the status column says so.
    const paidDate = parseDate(cell(r, idx.paidDate), dateOrder) || null;
    const insurancePaid = !!paidDate || isBilledFlag(cell(r, idx.billed));
    if (insurancePaid && !paidDate) errors.push("Marked billed but no paid date");

    return {
      line: n + 2, // +2: 1-indexed, and the header is line 1
      clinicianId: clin?.id ?? "", clinicianName: clin?.name ?? clinRaw,
      clientFirst: first, clientLast: last,
      insurerId: ins?.id ?? null, insurerName: ins?.name ?? insRaw,
      dateOfService,
      totalCost: isNaN(totalCost) ? 0 : totalCost,
      copayCollected: isNaN(copayCollected) ? 0 : copayCollected,
      insurancePaid, paidDate, notes: cell(r, idx.notes),
      errors,
    };
  });
}

/** Key used to spot a row that's already in the system (same visit, same money). */
export const dupeKey = (r: { clinicianId: string; clientFirst: string; clientLast: string; dateOfService: string; totalCost: number }) =>
  `${r.clinicianId}|${norm(r.clientFirst)}|${norm(r.clientLast)}|${r.dateOfService}|${r.totalCost}`;
