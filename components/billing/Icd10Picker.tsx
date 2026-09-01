"use client";

import { useMemo, useRef, useState } from "react";
import { ICD10, ICD10_ALIASES, type Icd10Code } from "@/lib/icd10";

// Selectable codes only (ranges/categories like F10–F19 aren't a single diagnosis).
const PICKABLE = ICD10.filter((c) => !c.range);
const byCode = new Map(PICKABLE.map((c) => [c.code, c] as const));
const flat = (s: string) => s.toLowerCase().replace(/[\s.]/g, "");

// code -> the acronyms/short names that point at it (reverse of ICD10_ALIASES).
const ALIASES_FOR = new Map<string, string[]>();
for (const [alias, codes] of Object.entries(ICD10_ALIASES)) {
  for (const code of codes) ALIASES_FOR.set(code, [...(ALIASES_FOR.get(code) ?? []), alias]);
}

// Rank a code against the query: exact code, code prefix, description prefix,
// then any substring — by code or by description, so "Major" and "F32" both work.
function search(q: string, exclude: Set<string>): Icd10Code[] {
  const query = q.trim().toLowerCase();
  const qc = flat(query);
  const scored = PICKABLE.filter((c) => !exclude.has(c.code)).map((c) => {
    const codeN = flat(c.code);
    const desc = c.description.toLowerCase();
    let score = 0;
    const aliases = ALIASES_FOR.get(c.code) ?? [];
    if (!query) score = 1;
    else if (codeN === qc) score = 100;
    else if (aliases.includes(query)) score = 95; // exact acronym, e.g. "ptsd"
    else if (qc && codeN.startsWith(qc)) score = 90;
    else if (aliases.some((a) => a.startsWith(query))) score = 85;
    else if (desc.startsWith(query)) score = 80;
    else if (desc.includes(query)) score = 60;
    else if (qc.length >= 2 && codeN.includes(qc)) score = 50;
    return { c, score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || a.c.code.localeCompare(b.c.code));
  return scored.slice(0, query ? 12 : 200).map((x) => x.c);
}

/** Type-ahead + browse picker for ICD-10 diagnoses. Search by description
 *  ("Major…") or by code ("F32…"); pick several; each shows as a chip. */
export default function Icd10Picker({ value, onChange }: { value: string[]; onChange: (codes: string[]) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = value;
  const excludeSet = useMemo(() => new Set(selected), [selected]);
  const results = useMemo(() => search(q, excludeSet), [q, excludeSet]);

  const add = (code: string) => {
    if (!selected.includes(code)) onChange([...selected, code]);
    setQ(""); setActive(0);
    inputRef.current?.focus();
  };
  const remove = (code: string) => onChange(selected.filter((c) => c !== code));

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[active]) add(results[active].code); }
    else if (e.key === "Escape") { setOpen(false); }
    else if (e.key === "Backspace" && !q && selected.length) { remove(selected[selected.length - 1]); }
  };

  return (
    <div className="icd">
      {selected.length > 0 && (
        <div className="icd-chips">
          {selected.map((code) => {
            const c = byCode.get(code);
            return (
              <span className="icd-chip" key={code}>
                <span className="icd-chip-code">{code}</span>
                <span className="icd-chip-desc">{c ? c.description : "Unknown code"}</span>
                <button type="button" aria-label={`Remove ${code}`} onClick={() => remove(code)}>×</button>
              </span>
            );
          })}
        </div>
      )}

      <div className="icd-box">
        <span className="icd-ic" aria-hidden="true">⌕</span>
        <input
          ref={inputRef}
          className="icd-input"
          type="text"
          placeholder={selected.length ? "Add another diagnosis…" : "Search a diagnosis — type a name or code (e.g. Major, or F32)"}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 120); }}
          onKeyDown={onKey}
          role="combobox" aria-expanded={open} aria-autocomplete="list"
        />
        {q && <button type="button" className="icd-clear" onClick={() => { setQ(""); inputRef.current?.focus(); }} aria-label="Clear search">×</button>}

        {open && (
          <div className="icd-menu" onMouseDown={() => { if (blurTimer.current) clearTimeout(blurTimer.current); }}>
            {results.length === 0 ? (
              <div className="icd-empty">No diagnosis matches “{q}”.</div>
            ) : (
              results.map((c, i) => (
                <button
                  type="button" key={c.code}
                  className={`icd-opt ${i === active ? "on" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => add(c.code)}
                >
                  <span className="icd-opt-code">{c.code}</span>
                  <span className="icd-opt-desc">{c.description}</span>
                  <span className="icd-opt-cat">{c.category}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <p className="icd-hint">{selected.length} diagnosis code{selected.length === 1 ? "" : "s"} attached · search by name or code, or scroll the list. Up to 12 for a claim.</p>
    </div>
  );
}
