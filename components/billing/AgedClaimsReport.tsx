"use client";

import { useState } from "react";

export interface ClaimRow {
  id: string;
  client: string;
  clientId: string | null;
  dateOfService: string;
  billedDate: string | null;
  cpt: string;
  amount: number;
  days: number;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const THRESHOLDS = [
  { key: "all", label: "All", min: 0 },
  { key: "60", label: "60+ days", min: 60 },
  { key: "90", label: "90+ days", min: 90 },
  { key: "120", label: "120+ days", min: 120 },
] as const;

// Aging bands used in the summary strip. 60+ is the one that matters for the
// meeting, so it is called out.
const BANDS = [
  { label: "0–14 days", min: 0, max: 14, late: false },
  { label: "15–30 days", min: 15, max: 30, late: false },
  { label: "31–60 days", min: 31, max: 60, late: false },
  { label: "60+ days", min: 61, max: Infinity, late: true },
];

export default function AgedClaimsReport({ rows, insurerName, claimCode, practiceName, asOf }: {
  rows: ClaimRow[]; insurerName: string; claimCode?: string | null; practiceName: string; asOf: string;
}) {
  const [minDays, setMinDays] = useState(0);
  const shown = rows.filter((r) => r.days >= minDays).sort((a, b) => b.days - a.days);
  const total = shown.reduce((t, r) => t + r.amount, 0);
  const bandTotals = BANDS.map((b) => {
    const inBand = rows.filter((r) => r.days >= b.min && r.days <= b.max);
    return { ...b, count: inBand.length, sum: inBand.reduce((t, r) => t + r.amount, 0) };
  });

  return (
    <div className="ac-wrap">
      <div className="ac-bar ac-noprint">
        <div className="ac-toggle" role="tablist" aria-label="Focus on age">
          {THRESHOLDS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={minDays === t.min} className={`ac-tbtn ${minDays === t.min ? "on" : ""}`} onClick={() => setMinDays(t.min)}>{t.label}</button>
          ))}
        </div>
        <button type="button" className="bl-cta ac-print" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <div className="ac-sheet">
        <header className="ac-head">
          <div>
            <div className="ac-practice">{practiceName}</div>
            <div className="ac-sub">Outstanding insurance claims</div>
          </div>
          <div className="ac-headright">
            <div className="ac-insurer">{insurerName}</div>
            {claimCode ? <div className="ac-code">Payer code {claimCode}</div> : null}
            <div className="ac-asof">As of {asOf}</div>
          </div>
        </header>

        <div className="ac-summary">
          {bandTotals.map((b) => (
            <div key={b.label} className={`ac-sumcell ${b.late ? "late" : ""}`}>
              <div className="ac-sumk">{b.label}</div>
              <div className="ac-sumv">{money(b.sum)}</div>
              <div className="ac-sumc">{b.count} {b.count === 1 ? "claim" : "claims"}</div>
            </div>
          ))}
        </div>

        <div className="ac-total">
          <span>{minDays > 0 ? `Shown (${minDays}+ days)` : "Total outstanding"}</span>
          <span>{money(total)} · {shown.length} {shown.length === 1 ? "claim" : "claims"}</span>
        </div>

        <table className="ac-tbl">
          <thead>
            <tr><th>Client</th><th>Date of service</th><th>Submitted</th><th>CPT</th><th className="num">Amount</th><th className="num">Days out</th></tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={6} className="ac-empty">No claims in this range.</td></tr>
            ) : shown.map((r) => (
              <tr key={r.id} className={r.days >= 60 ? "aged" : ""}>
                <td className="ac-nm">{r.client}</td>
                <td>{r.dateOfService}</td>
                <td>{r.billedDate ?? <span className="ac-muted">not submitted</span>}</td>
                <td>{r.cpt}</td>
                <td className="num">{money(r.amount)}</td>
                <td className="num ac-days">{r.days}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="ac-foot">{practiceName} · {insurerName} · outstanding claims as of {asOf}</footer>
      </div>
    </div>
  );
}
