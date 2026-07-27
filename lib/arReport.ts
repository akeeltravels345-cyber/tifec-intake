// =============================================================================
// Parser for the practice's "Payment Application Report" PDF (exported per
// provider). Pulls out the distinct CLIENTS and the insurer each is billed
// under, so they can be created as that clinician's client roster.
//
// Every client block in the report reads:
//   <PAYOR>\tPayor Name: Patient Name: <Last, First>
// where <PAYOR> is an insurer (AETNA, CINICO, …) or, for self-pay, the client's
// own name. We match on those header lines only — never the messy per-visit
// payment rows — so extraction stays reliable across the report's page breaks.
// =============================================================================

export interface ParsedClient {
  first: string;
  last: string;
  raw: string;          // "Last, First" as printed, for display in the preview
  insurerName: string | null;  // null = self-pay
}

export interface ParsedReport {
  providerName: string | null;  // e.g. "O'Connor, Donnet"
  clients: ParsedClient[];
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** "Last, First" → { first, last }. Falls back gracefully if there's no comma. */
function splitName(raw: string): { first: string; last: string } {
  const t = norm(raw);
  if (t.includes(",")) {
    const [last, first] = t.split(",", 2);
    return { first: norm(first ?? ""), last: norm(last ?? "") };
  }
  // No comma: treat the last token as the surname.
  const parts = t.split(" ");
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

export function parseArReport(text: string): ParsedReport {
  const provM = text.match(/Provider:\s*([^,]+,\s*[^,]+?)\s*,/);
  const providerName = provM ? norm(provM[1]) : null;

  // Payor may be tab- or space-separated from the "Payor Name:" label depending
  // on the extractor, so accept either.
  const rows = [...text.matchAll(/(.+?)[\t ]+Payor Name:\s*Patient Name:\s*(.+)/g)];

  // Dedup by client, preferring an insurer over a self-pay entry (a client who
  // pays out of pocket for one session but is otherwise insured should keep the
  // insurer as their usual one).
  const byClient = new Map<string, ParsedClient>();
  for (const m of rows) {
    const payorRaw = norm(m[1]);
    const patientRaw = norm(m[2]);
    if (!patientRaw) continue;

    // Self-pay: the payor is the client's own name (or empty), not an insurer.
    const selfPay = norm(payorRaw).toLowerCase() === patientRaw.toLowerCase();
    const insurerName = selfPay || !payorRaw ? null : payorRaw;

    const { first, last } = splitName(patientRaw);
    const key = `${first}|${last}`.toLowerCase();
    const existing = byClient.get(key);
    if (!existing) {
      byClient.set(key, { first, last, raw: patientRaw, insurerName });
    } else if (!existing.insurerName && insurerName) {
      existing.insurerName = insurerName; // upgrade self-pay → insured
    }
  }

  return { providerName, clients: [...byClient.values()] };
}

/** Match a report payor name to one of the practice's insurers, loosely
 *  (case-insensitive, ignoring spaces) so "CAYMAN FIRST" finds "Cayman First". */
export function matchInsurer<T extends { id: string; name: string }>(
  payor: string | null,
  insurers: T[],
): T | undefined {
  if (!payor) return undefined;
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const q = squash(payor);
  return (
    insurers.find((i) => squash(i.name) === q) ??
    insurers.find((i) => squash(i.name).includes(q) || q.includes(squash(i.name)))
  );
}
