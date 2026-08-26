"use client";

import { useState } from "react";

// Plain-language explanations of the money words on the clinician dashboard.
// Collapsible so it's a reference during a training, out of the way afterwards.
const ITEMS: [string, string][] = [
  ["Total earned", "The full value of the work you did this month, before anything is taken out — whether or not the money has arrived yet."],
  ["Collected at visit", "Cash taken on the day: co-pays on insured visits, or the whole fee when the client is self-pay. This is money in hand."],
  ["Insurance collected", "Insurance payments that have actually landed this month. This is real cash, and it's what your payout is worked out from."],
  ["Settled by insurers", "The part of this month's work the insurer has resolved — paid, or written off / down. It's a progress figure, not cash: only the part actually paid counts toward your payout."],
  ["Insurance outstanding", "Insurance still on its way to you: claims not yet billed, or billed (submitted) and awaiting payment."],
  ["Co-pays not collected", "Co-pays that were due at the visit but weren't taken. It stays a write-off unless you collect it later."],
  ["To bill / Billed / Collected", "A claim's life: To bill (logged, not yet submitted) → Billed (submitted to the insurer, waiting) → Collected (money in)."],
  ["Your payout", "A share of the cash actually collected this month, not of what you earned. Sessions still with the insurer pay out in the month the money arrives."],
];

export default function StatGlossary() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ margin: "0 0 18px" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ background: "none", border: "none", padding: "6px 0", cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 600, color: "var(--indigo, #3f3a8c)" }}
      >
        {open ? "▾" : "▸"} What these numbers mean
      </button>
      {open && (
        <dl style={{ margin: "6px 0 0", display: "grid", gap: 10, background: "var(--paper, #fbf9f4)", border: "1px solid var(--hair, #ece7dc)", borderRadius: 12, padding: "14px 16px" }}>
          {ITEMS.map(([term, def]) => (
            <div key={term} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 160px) 1fr", gap: 12, fontSize: 13, alignItems: "baseline" }}>
              <dt style={{ fontWeight: 700, color: "var(--ink, #1c2330)" }}>{term}</dt>
              <dd style={{ margin: 0, color: "var(--muted, #5c636e)", lineHeight: 1.5 }}>{def}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
