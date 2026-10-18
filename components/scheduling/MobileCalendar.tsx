"use client";

import { useState } from "react";

const DOW = ["M", "T", "W", "T", "F", "S", "S"];
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export default function MobileCalendar({ daysWithAppts, today }: { daysWithAppts: string[]; today: string }) {
  const has = new Set(daysWithAppts);
  const [ty, tm] = today.split("-").map(Number);
  const [view, setView] = useState({ y: ty, m: tm }); // m is 1-12

  const first = new Date(Date.UTC(view.y, view.m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday-based leading blanks
  const dim = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate();
  const monthName = first.toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];

  const prev = () => setView((v) => (v.m <= 1 ? { y: v.y - 1, m: 12 } : { y: v.y, m: v.m - 1 }));
  const next = () => setView((v) => (v.m >= 12 ? { y: v.y + 1, m: 1 } : { y: v.y, m: v.m + 1 }));

  return (
    <div className="mcal">
      <header className="mcal-head">
        <button className="mcal-nav" onClick={prev} aria-label="Previous month">‹</button>
        <div className="mcal-month">{monthName}</div>
        <button className="mcal-nav" onClick={next} aria-label="Next month">›</button>
      </header>
      <div className="mcal-body">
        <div className="mcal-dow">{DOW.map((d, i) => <span key={i}>{d}</span>)}</div>
        <div className="mcal-grid">
          {cells.map((d, i) => {
            if (d === null) return <span key={`b${i}`} className="mcal-cell blank" />;
            const date = ymd(view.y, view.m, d);
            return (
              <a key={date} href={`/m?d=${date}`} className={`mcal-cell${date === today ? " today" : ""}`}>
                <span className="mcal-n">{d}</span>
                <span className={`mcal-dot${has.has(date) ? " show" : ""}`} aria-hidden="true" />
              </a>
            );
          })}
        </div>
        <p className="mcal-hint">Tap a day to open its agenda.</p>
      </div>
    </div>
  );
}
