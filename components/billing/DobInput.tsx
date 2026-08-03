"use client";

import { useEffect, useState } from "react";

/**
 * Date-of-birth picker built from three plain dropdowns (Month / Day / Year).
 *
 * We deliberately avoid the native <input type="date"> for birth dates: to reach
 * a year decades back you have to page the calendar month-by-month, and on some
 * browsers the year segment is hard to type — so people "can't add the year".
 * Three selects make the year a direct choice and work identically everywhere.
 *
 * Emits an ISO "YYYY-MM-DD" string once all three parts are chosen, "" otherwise.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parse(v: string): { y: string; mo: string; d: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || "");
  return m ? { y: m[1], mo: String(Number(m[2])), d: String(Number(m[3])) } : { y: "", mo: "", d: "" };
}

function daysIn(mo: string, y: string): number {
  if (!mo) return 31;
  // Year defaults to a leap year so Feb 29 stays selectable until a year is picked.
  const yr = y ? Number(y) : 2000;
  return new Date(yr, Number(mo), 0).getDate();
}

export default function DobInput({
  value,
  onChange,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  style?: React.CSSProperties;
}) {
  const init = parse(value);
  const [y, setY] = useState(init.y);
  const [mo, setMo] = useState(init.mo);
  const [d, setD] = useState(init.d);

  // Re-sync when the parent value changes (form reset, switching records).
  useEffect(() => {
    const p = parse(value);
    setY(p.y);
    setMo(p.mo);
    setD(p.d);
  }, [value]);

  function emit(ny: string, nmo: string, nd: string) {
    onChange(ny && nmo && nd ? `${ny}-${nmo.padStart(2, "0")}-${nd.padStart(2, "0")}` : "");
  }

  const nowYear = new Date().getFullYear();
  const years: number[] = [];
  for (let yr = nowYear; yr >= nowYear - 120; yr--) years.push(yr);

  const maxDay = daysIn(mo, y);
  const days: number[] = [];
  for (let i = 1; i <= maxDay; i++) days.push(i);

  function pickMonth(nmo: string) {
    // Drop an out-of-range day (e.g. 31 -> Feb) so we never emit an invalid date.
    const nd = d && Number(d) > daysIn(nmo, y) ? "" : d;
    setMo(nmo);
    setD(nd);
    emit(y, nmo, nd);
  }
  function pickDay(nd: string) {
    setD(nd);
    emit(y, mo, nd);
  }
  function pickYear(ny: string) {
    const nd = d && Number(d) > daysIn(mo, ny) ? "" : d;
    setY(ny);
    setD(nd);
    emit(ny, mo, nd);
  }

  return (
    <div className="dob-in" style={style}>
      <select className="ls-in dob-mo" value={mo} onChange={(e) => pickMonth(e.target.value)} aria-label="Birth month">
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={i} value={String(i + 1)}>{name}</option>
        ))}
      </select>
      <select className="ls-in dob-day" value={d} onChange={(e) => pickDay(e.target.value)} aria-label="Birth day">
        <option value="">Day</option>
        {days.map((n) => (
          <option key={n} value={String(n)}>{n}</option>
        ))}
      </select>
      <select className="ls-in dob-yr" value={y} onChange={(e) => pickYear(e.target.value)} aria-label="Birth year">
        <option value="">Year</option>
        {years.map((yr) => (
          <option key={yr} value={String(yr)}>{yr}</option>
        ))}
      </select>
    </div>
  );
}
