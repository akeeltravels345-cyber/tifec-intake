// =============================================================================
// Read a referral's expiry (and, when present, its start) date from an uploaded
// referral — first from the PDF's TEXT, then, as a fallback, from the FILENAME.
// Returns the end date as YYYY-MM-DD plus where it came from, or needsReview when
// nothing can be read confidently. Pure string logic (text in, dates out) so it
// is easy to test and tune. It never guesses: a date is only accepted when it
// sits next to an expiry word, or when the source contains exactly one date.
// =============================================================================

export interface ReferralExtract {
  endDate?: string;    // YYYY-MM-DD
  startDate?: string;  // YYYY-MM-DD (only when clearly labelled)
  source: "document" | "filename" | "none";
  needsReview: boolean;
}

// Ambiguous all-numeric dates (e.g. 05/06/2026) are read as DAY/MONTH/YEAR, the
// British/Cayman convention. Flip this one flag if referrals use MONTH/DAY/YEAR.
const NUMERIC_DAY_FIRST = true;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

// Words that mean "this date is when it ENDS" / "starts", used to anchor a date.
// "ref exp <date>" is the practice's filename convention (e.g. "DAWES, Isabelle K.,
// ref exp 27-FEB-27.pdf"), so it anchors the expiry directly.
const EXPIRY = /(ref\.?\s*exp\w*|valid\s*(?:until|to|through|thru|up\s*to)|expir\w*|expiration|authoriz\w*\s*(?:until|through|thru|to|end|end\s*date)|good\s*(?:until|through|thru)|end\s*date|valid\s*end|until|through|thru)/i;
const START = /(valid\s*from|effective\s*(?:date|from)?|start\s*date|issue\s*date|date\s*of\s*(?:referral|issue)|from|valid\s*start)/i;

function toISO(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function yr(n: number): number { return n < 100 ? (n >= 70 ? 1900 + n : 2000 + n) : n; }

interface Found { iso: string; index: number; end: number }

/** Every date found in `text`, in order, with the character span it occupied. */
function findDates(text: string): Found[] {
  const out: Found[] = [];
  const push = (iso: string | null, index: number, end: number) => { if (iso) out.push({ iso, index, end }); };

  // ISO-ish: 2026-12-31, 2026/12/31, 2026.12.31
  for (const m of text.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g))
    push(toISO(+m[1], +m[2], +m[3]), m.index!, m.index! + m[0].length);

  // All-numeric d/m/y or m/d/y: 31/12/2026, 31-12-26, 5.6.2026
  for (const m of text.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g)) {
    const a = +m[1], b = +m[2], y = yr(+m[3]);
    let iso = toISO(y, NUMERIC_DAY_FIRST ? b : a, NUMERIC_DAY_FIRST ? a : b);
    if (!iso) iso = toISO(y, NUMERIC_DAY_FIRST ? a : b, NUMERIC_DAY_FIRST ? b : a); // fall back to the other order
    push(iso, m.index!, m.index! + m[0].length);
  }

  // Day month-name year, with hyphen, space or dot separators and a 2- or 4-digit
  // year: 27-FEB-27, 12-SEP-26, 31 Dec 2026, 31st December, 2026, 27-FEB-2027.
  for (const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?[-\s.]+([A-Za-z]{3,9})\.?,?[-\s.]+(\d{2,4})\b/g)) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon) push(toISO(yr(+m[3]), mon, +m[1]), m.index!, m.index! + m[0].length);
  }

  // Month-name day year: Dec 31, 2026 / December 31 2026 / FEB-27-27.
  for (const m of text.matchAll(/\b([A-Za-z]{3,9})\.?[-\s]+(\d{1,2})(?:st|nd|rd|th)?,?[-\s]+(\d{2,4})\b/g)) {
    const mon = MONTHS[m[1].toLowerCase()];
    if (mon) push(toISO(yr(+m[3]), mon, +m[2]), m.index!, m.index! + m[0].length);
  }

  return out.sort((x, y2) => x.index - y2.index);
}

/** The date sitting closest AFTER an anchor word (within `window` chars), which
 *  is how "valid until: <date>" or "expiry <date>" reads. */
function anchoredDate(text: string, anchor: RegExp, dates: Found[], window = 40): string | undefined {
  let best: { iso: string; gap: number } | undefined;
  const re = new RegExp(anchor.source, "gi");
  for (const a of text.matchAll(re)) {
    const anchorEnd = a.index! + a[0].length;
    for (const d of dates) {
      const gap = d.index - anchorEnd;
      if (gap >= 0 && gap <= window && (!best || gap < best.gap)) best = { iso: d.iso, gap };
    }
  }
  return best?.iso;
}

/** Read the referral's dates from its PDF text (preferred) and/or filename. */
export function extractReferral(pdfText: string, filename: string): ReferralExtract {
  // 1) The document's own text — the most trustworthy source.
  const text = (pdfText || "").replace(/\s+/g, " ");
  if (text.trim()) {
    const dates = findDates(text);
    const end = anchoredDate(text, EXPIRY, dates);
    if (end) {
      const start = anchoredDate(text, START, dates.filter((d) => d.iso !== end));
      return { endDate: end, startDate: start, source: "document", needsReview: false };
    }
  }

  // 2) The filename — strip the extension, then look for an anchor or a lone date.
  const base = (filename || "").replace(/\.[a-z0-9]+$/i, "").replace(/[_]+/g, " ");
  if (base.trim()) {
    const fdates = findDates(base);
    const fend = anchoredDate(base, EXPIRY, fdates, 24);
    if (fend) return { endDate: fend, source: "filename", needsReview: false };
    if (fdates.length === 1) return { endDate: fdates[0].iso, source: "filename", needsReview: false };
    // Two dates and no anchor: a referral spans start→end, so the LATER date is
    // the expiry.
    if (fdates.length >= 2) {
      const latest = fdates.map((d) => d.iso).sort().at(-1);
      if (latest) return { endDate: latest, source: "filename", needsReview: false };
    }
  }

  // 3) Nothing readable — flag it, never guess.
  return { source: "none", needsReview: true };
}
