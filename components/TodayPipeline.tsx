"use client";

import Link from "next/link";
import { useState, useRef } from "react";

export interface MonthPipe {
  key: string;   // "2026-08"
  label: string; // "August 2026"
  notBilled: number;
  withInsurers: number;
  inBank: number;
  total: number;
}

const money2 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The owner's money pipeline, one month at a time. `months` is newest-first,
// so index 0 is the current month. Navigate with the arrows, a left/right
// swipe (touch), or the arrow keys.
export default function TodayPipeline({ months }: { months: MonthPipe[] }) {
  const [idx, setIdx] = useState(0);
  const startX = useRef<number | null>(null);

  if (months.length === 0) return null;
  const i = Math.min(idx, months.length - 1);
  const m = months[i];
  const canOlder = i < months.length - 1; // further back in time
  const canNewer = i > 0;                  // toward the current month
  const older = () => setIdx((n) => Math.min(n + 1, months.length - 1));
  const newer = () => setIdx((n) => Math.max(n - 1, 0));

  function onTouchStart(e: React.TouchEvent) { startX.current = e.touches[0].clientX; }
  function onTouchEnd(e: React.TouchEvent) {
    if (startX.current == null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) < 40) return; // ignore taps / tiny drags
    if (dx < 0) older(); else newer(); // swipe left = older, right = newer
  }

  return (
    <div
      className="bo-card today-pipe"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onKeyDown={(e) => { if (e.key === "ArrowLeft") older(); else if (e.key === "ArrowRight") newer(); }}
      tabIndex={0}
      role="group"
      aria-roledescription="carousel"
      aria-label="Practice money by month"
    >
      <div className="today-pipe-head">
        <div className="today-pipe-nav">
          <button type="button" className="today-pipe-arrow" onClick={older} disabled={!canOlder} aria-label="Earlier month">‹</button>
          <span className="bo-lab today-pipe-month">{m.label}</span>
          <button type="button" className="today-pipe-arrow" onClick={newer} disabled={!canNewer} aria-label="Later month">›</button>
        </div>
        <span className="today-pipe-total">{money2(m.total)} charged</span>
      </div>

      <div className="today-bar">
        {m.total > 0 ? (
          <>
            <i style={{ width: `${(m.inBank / m.total) * 100}%`, background: "var(--teal)" }} />
            <i style={{ width: `${(m.withInsurers / m.total) * 100}%`, background: "var(--amber)" }} />
            <i style={{ width: `${(m.notBilled / m.total) * 100}%`, background: "#d8cbb0" }} />
          </>
        ) : (
          <i style={{ width: "100%", background: "var(--hair)" }} />
        )}
      </div>

      <div className="today-pipe-cells">
        <div><span className="tp-dot" style={{ background: "#d8cbb0" }} />Not billed yet<b>{money2(m.notBilled)}</b></div>
        <div><span className="tp-dot" style={{ background: "var(--amber)" }} />With insurers<b>{money2(m.withInsurers)}</b></div>
        <div><span className="tp-dot" style={{ background: "var(--teal)" }} />In the bank<b>{money2(m.inBank)}</b></div>
      </div>

      {months.length > 1 && (
        <div className="today-pipe-dots" aria-hidden="true">
          {months.map((mm, di) => (
            <button
              key={mm.key}
              type="button"
              className={`today-pipe-pip${di === i ? " on" : ""}`}
              onClick={() => setIdx(di)}
              title={mm.label}
            />
          ))}
        </div>
      )}

      <Link href="/billing/overview" className="today-pipe-link">Full P&amp;L, trend and by-clinician in the business overview →</Link>
      <Link href="/billing/payments" className="today-pipe-link" style={{ marginTop: 2 }}>Nick&apos;s queue handles the claim-by-claim submissions →</Link>
    </div>
  );
}
