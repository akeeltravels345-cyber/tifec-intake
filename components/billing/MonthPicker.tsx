"use client";

import { useRouter } from "next/navigation";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function MonthPicker({ year, month, path }: { year: number; month: number; path: string }) {
  const router = useRouter();
  const go = (y: number, m: number) => router.push(`${path}?y=${y}&m=${m}`);
  const prev = () => (month === 1 ? go(year - 1, 12) : go(year, month - 1));
  const next = () => (month === 12 ? go(year + 1, 1) : go(year, month + 1));
  const years = [year - 2, year - 1, year, year + 1];

  return (
    <div className="bz-month">
      <button className="bz-month-nav" onClick={prev} aria-label="Previous month">‹</button>
      <select value={month} onChange={(e) => go(year, Number(e.target.value))}>
        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
      <select value={year} onChange={(e) => go(Number(e.target.value), month)}>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <button className="bz-month-nav" onClick={next} aria-label="Next month">›</button>
    </div>
  );
}
