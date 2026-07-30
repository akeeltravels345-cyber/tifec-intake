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
  dob?: string;         // "Accounts Receivable by Invoice" carries a DOB
  outstanding?: number; // total due, from the AR report (0 otherwise)
  invoiceDate?: string; // earliest invoice date (YYYY-MM-DD), for the queue
  /** One entry per invoice line — so a client with several invoices becomes
   *  several charges (each its own date of service), not one lump sum. */
  invoices?: { date: string; amount: number; code?: string }[];
}

export interface ParsedReport {
  providerName: string | null;  // e.g. "O'Connor, Donnet"
  clients: ParsedClient[];
  /** Which report this was, in case the caller wants to treat AR differently. */
  kind: "ar" | "payments" | "unknown";
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

  // Three report shapes come out of the practice's system. Pick the parser by the
  // report's own title.
  if (/Unpaid Services Report/i.test(text)) {
    return { providerName, kind: "ar", clients: parseUnpaidServices(text) };
  }
  if (/Accounts Receivable by Invoice/i.test(text)) {
    return { providerName, kind: "ar", clients: parseArByInvoice(text) };
  }

  // "Payment Application Report" — payor may be tab- or space-separated from the
  // "Payor Name:" label depending on the extractor, so accept either.
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

  return { providerName, kind: "payments", clients: [...byClient.values()] };
}

/** "Accounts Receivable by Invoice": each client is a header line carrying an
 *  optional phone and a DOB, followed by one or more invoice lines whose payor
 *  sits after a tab, and an aging line. This is the true outstanding report, so
 *  it also yields the amount owed per client. */
function parseArByInvoice(text: string): ParsedClient[] {
  const lines = text.split("\n");
  const money = (s: string) => Number(s.replace(/[$,]/g, "")) || 0;
  const byClient = new Map<string, ParsedClient>();
  let cur: ParsedClient | null = null;

  // A client header: "Last, First [Client Phone: …] DOB: dd/mm/yyyy"
  const header = /^([^,\n]+,\s*[^\n]*?)\s+(?:Client Phone:[^\n]*?\s+)?DOB:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*$/;
  // An invoice line names the payor after the amounts, then "policy/…/… n". The
  // payor sits right after a tab (pdf-parse) OR stuck onto the last $ amount
  // (unpdf merges columns with no tab, e.g. "$750.00CINICO 996…/-/- 1").
  const invoice = /(?:\t|\$[\d,]+\.\d{2})([A-Za-z][A-Za-z .'&/-]*?)\s+\S*\d/;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (/^GRAND TOTAL/i.test(line) || /Division Summary/i.test(line)) { cur = null; continue; }

    const h = line.match(header);
    if (h) {
      const nameRaw = norm(h[1].replace(/\s+Client Phone:.*$/, ""));
      const { first, last } = splitName(nameRaw);
      const key = `${first}|${last}`.toLowerCase();
      cur = byClient.get(key) ?? null;
      if (!cur) { cur = { first, last, raw: nameRaw, insurerName: null, dob: ddmmyyyyToIso(h[2]) ?? h[2], outstanding: 0, invoices: [] }; byClient.set(key, cur); }
      continue;
    }
    if (!cur) continue;

    const inv = line.match(invoice);
    if (inv && !cur.insurerName) {
      const payor = norm(inv[1]);
      // Self-pay AR rows carry the client's own name as the payor.
      cur.insurerName = payor.toLowerCase() === cur.raw.toLowerCase() ? null : payor;
    }
    // The invoice line's first money amount is that invoice's total; sum them,
    // and keep the earliest invoice date to date the outstanding claim.
    const amt = line.match(/^\d+\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+\$([\d,]+\.\d{2})/);
    if (amt) {
      const amount = money(amt[2]);
      cur.outstanding = round2((cur.outstanding ?? 0) + amount);
      const iso = ddmmyyyyToIso(amt[1]);
      if (iso) (cur.invoices ??= []).push({ date: iso, amount });
      if (iso && (!cur.invoiceDate || iso < cur.invoiceDate)) cur.invoiceDate = iso;
    }
  }

  return [...byClient.values()];
}

/** "Unpaid Services Report": one block per client —
 *    <Last, First>  DOB: dd/mm/yyyy[Phone: …]
 *    <PAYOR> ID/Policy/Claim #: …            (absent for self-pay clients)
 *    $amt  n unit  <bill date>  <code>-<desc>  <inv#> <days> <service date>  $…  $total
 *    … more service lines …
 *    $amt  n units  <Last, First> Totals: … $total
 *  Each service line becomes one outstanding charge (its own service date), so a
 *  client with several invoices lands as several claims, not one lump sum. */
function parseUnpaidServices(text: string): ParsedClient[] {
  const lines = text.split("\n");
  const money = (s: string) => Number(s.replace(/[$,]/g, "")) || 0;
  const byClient = new Map<string, ParsedClient>();
  let cur: ParsedClient | null = null;

  // Header: a "Last, First" name (comma required) immediately before "DOB:".
  const header = /^([^\n]*?,[^\n]*?)\s+DOB:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/;
  // Insurer line: "<PAYOR> ID/Policy/Claim #: …".
  const insurerLine = /^(.+?)\s+ID\/Policy\/Claim\s*#:/;
  // A service line: the SERVICE date (the dd/mm/yyyy that sits right before the
  // run of $ amounts) and the line's Total Amount (the last $ figure on the line).
  const service = /(\d{1,2}\/\d{1,2}\/\d{4})\s+\$[\d,]+\.\d{2}[\s$\d.,]*\$([\d,]+\.\d{2})\s*$/;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (/^GRAND TOTAL/i.test(line) || /Division Summary/i.test(line) || /Report Total/i.test(line)) { cur = null; continue; }

    const h = line.match(header);
    if (h) {
      const nameRaw = norm(h[1].replace(/\s+Phone:.*$/i, ""));
      const { first, last } = splitName(nameRaw);
      const key = `${first}|${last}`.toLowerCase();
      cur = byClient.get(key) ?? null;
      if (!cur) { cur = { first, last, raw: nameRaw, insurerName: null, dob: ddmmyyyyToIso(h[2]) ?? h[2], outstanding: 0, invoices: [] }; byClient.set(key, cur); }
      continue;
    }
    if (!cur) continue;

    if (!cur.insurerName) {
      const im = line.match(insurerLine);
      if (im) {
        const payor = norm(im[1]);
        // Self-pay rows carry the client's own name as the payor.
        cur.insurerName = payor.toLowerCase() === cur.raw.toLowerCase() ? null : payor;
      }
    }

    if (/Totals:/i.test(line)) continue; // the client subtotal line — not a charge
    const sm = line.match(service);
    if (sm) {
      const iso = ddmmyyyyToIso(sm[1]);
      const amount = money(sm[2]);
      if (iso && amount > 0) {
        // The service is printed as "<CPT>-<description>" (e.g. "90837-Psychotherapy").
        // Anchor on the 5-digit CPT + "-" + a letter, so it's caught whether the code
        // follows a bill date, follows "unit", or is fused onto the amount.
        const codeM = line.match(/([0-9]{5})-[A-Za-z]/);
        const code = codeM ? codeM[1] : undefined;
        (cur.invoices ??= []).push({ date: iso, amount, code });
        cur.outstanding = round2((cur.outstanding ?? 0) + amount);
        if (!cur.invoiceDate || iso < cur.invoiceDate) cur.invoiceDate = iso;
      }
    }
  }

  return [...byClient.values()];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The report prints dd/mm/yyyy; the app stores YYYY-MM-DD. */
function ddmmyyyyToIso(s: string): string | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = `20${y}`;
  const dd = d.padStart(2, "0"), mm = mo.padStart(2, "0");
  if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return null;
  return `${y}-${mm}-${dd}`;
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
