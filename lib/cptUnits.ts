// Pure helpers for CPT units — a session's cptCodes array carries UNITS as
// multiplicity (a code billed twice appears twice). No server-only imports, so
// this is safe to use from client components as well as server code.

/** Collapse a repeated code array into [{code, units}], keeping first-seen order. */
export function collapseUnits(codes: string[]): { code: string; units: number }[] {
  const order: string[] = [];
  const n: Record<string, number> = {};
  for (const c of codes) {
    if (!(c in n)) { n[c] = 0; order.push(c); }
    n[c]++;
  }
  return order.map((code) => ({ code, units: n[code] }));
}

/** A short label with multiplicity, e.g. "90837 ×2, 90847". Pass descFn to show
 *  descriptions instead of raw codes. */
export function codeSummary(codes: string[], descFn?: (c: string) => string): string {
  return collapseUnits(codes)
    .map(({ code, units }) => {
      const base = descFn ? (descFn(code) || code) : code;
      return units > 1 ? `${base} ×${units}` : base;
    })
    .join(", ");
}
