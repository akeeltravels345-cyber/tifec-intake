"use client";

import { useState } from "react";

export interface InsRow {
  client: string;
  insurer: string;
  dateOfService: string;
  paidDate: string | null;
  amount: number;
  fromThisMonth: boolean;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}`;
}

// The "Insurance collected" KPI, split by which visit each payment was for:
// money for this month's visits vs money that only landed now for older visits
// (the insurance lag). Expands to an itemised list. Rendered inside the KPI
// grid; the breakdown panel spans the full grid width as its own row.
export default function InsuranceCollectedKpi({ total, thisMonth, prior, monthLabel, rows }: {
  total: number; thisMonth: number; prior: number; monthLabel: string; rows: InsRow[];
}) {
  const [open, setOpen] = useState(false);
  // Within each section: group a client's visits together (by name), and order
  // that client's visit dates oldest first.
  const byClientThenDate = (a: InsRow, b: InsRow) =>
    a.client.localeCompare(b.client) || a.dateOfService.localeCompare(b.dateOfService);
  const priorRows = rows.filter((r) => !r.fromThisMonth).sort(byClientThenDate);
  const thisRows = rows.filter((r) => r.fromThisMonth).sort(byClientThenDate);
  const hasSplit = total > 0 && rows.length > 0;

  return (
    <div className={`cd-kpi cd-inskpi ${open && hasSplit ? "open" : ""}`}>
      <div className="ins-summary">
        <div className="k hastip" data-tip="Insurance cash that actually landed this month. Expand to see how much is for this month's visits versus earlier ones.">Insurance collected</div>
        <div className="v">{money0(total)}</div>
        {hasSplit && (
          <div className="ins-pills">
            <span className="ins-pill">{money0(thisMonth)} this month</span>
            {prior > 0 && <span className="ins-pill earlier">{money0(prior)} earlier</span>}
          </div>
        )}
        {hasSplit && (
          <button type="button" className="ins-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Hide breakdown" : "Show breakdown"} <span className={`ins-caret ${open ? "up" : ""}`}>▾</span>
          </button>
        )}
      </div>

      {open && hasSplit && (
        <div className="ins-breakdown">
          <div className="ins-bd-head">
            <span>What made up this month&apos;s insurance cash</span>
            <span className="ins-bd-sub">by the visit it paid for</span>
          </div>

          <div className="ins-bd-group">
            <div className="ins-bd-grow">
              <span className="ins-bd-name">From this month&apos;s visits <span className="ins-bd-count">· {thisRows.length} {thisRows.length === 1 ? "payment" : "payments"}</span></span>
              <span className="ins-bd-amt">{money(thisMonth)}</span>
            </div>
            {thisRows.map((r, i) => (
              <div key={`t${i}`} className="ins-bd-item">
                <span className="ins-bd-when"><span className="ins-tag this">{fmtDay(r.dateOfService)}</span>{r.client} · visit {fmtDay(r.dateOfService)} · paid {fmtDay(r.paidDate)}{r.insurer ? ` · ${r.insurer}` : ""}</span>
                <span className="ins-bd-iamt">{money(r.amount)}</span>
              </div>
            ))}
          </div>

          <div className="ins-bd-group">
            <div className="ins-bd-grow">
              <span className="ins-bd-name">From earlier months&apos; visits <span className="ins-bd-count">· {priorRows.length} {priorRows.length === 1 ? "payment" : "payments"}</span></span>
              <span className="ins-bd-amt earlier">{money(prior)}</span>
            </div>
            {priorRows.map((r, i) => (
              <div key={`p${i}`} className="ins-bd-item">
                <span className="ins-bd-when"><span className="ins-tag earlier">{fmtDay(r.dateOfService)}</span>{r.client} · visit {fmtDay(r.dateOfService)} · paid {fmtDay(r.paidDate)}{r.insurer ? ` · ${r.insurer}` : ""}</span>
                <span className="ins-bd-iamt">{money(r.amount)}</span>
              </div>
            ))}
            {priorRows.length === 0 && <div className="ins-bd-empty">Nothing from earlier months.</div>}
          </div>

          <div className="ins-bd-total">
            <span>Total insurance collected in {monthLabel}</span>
            <span>{money(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
