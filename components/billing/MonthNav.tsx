"use client";

import { useRouter } from "next/navigation";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function MonthNav({ year, month, path }: { year: number; month: number; path: string }) {
  const router = useRouter();
  const go = (y: number, m: number) => router.push(`${path}?y=${y}&m=${m}`);
  return (
    <div className="cd-month">
      <button className="cd-mbtn" onClick={() => (month === 1 ? go(year - 1, 12) : go(year, month - 1))} aria-label="Previous month">‹</button>
      <button className="cd-mbtn on">{MONTHS[month - 1]} {year}</button>
      <button className="cd-mbtn" onClick={() => (month === 12 ? go(year + 1, 1) : go(year, month + 1))} aria-label="Next month">›</button>
    </div>
  );
}
