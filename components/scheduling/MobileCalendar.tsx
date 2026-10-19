"use client";

import { useMemo, useState } from "react";
import MobileWhoPicker from "@/components/scheduling/MobileWhoPicker";
import "./mobile-calendar.css";

type Appt = { id: string; startAt: string; endAt: string; clientName: string; typeId: string | null; mode: string; status: string; capacity: number; billingSessionId: string | null; intakeStatus: string; clinicianId?: string };
type Type = { id: string; name: string; capacity: number };

const lastName = (name: string) => name.replace(/^\s*(dr|mr|mrs|ms|mx|prof)\.?\s+/i, "").trim().split(/\s+/).pop() || name;

// Cayman time (UTC-5, no DST) for all user-facing dates and times.
const CAY = 5;
const cayDate = (iso: string) => new Date(Date.parse(iso) - CAY * 3600e3).toISOString().slice(0, 10);
const cayMin = (iso: string) => { const d = new Date(Date.parse(iso) - CAY * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const label12 = (min: number) => { let h = Math.floor(min / 60); const m = min % 60; const ap = h < 12 ? "am" : "pm"; h = h % 12 || 12; return { t: `${h}${m ? ":" + String(m).padStart(2, "0") : ""}`, ap }; };
const addDays = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const mondayOf = (d: string) => { const [y, m, dd] = d.split("-").map(Number); const w = (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7; return addDays(d, -w); };
const parts = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd)); };
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const monthShift = (d: string, delta: number) => { const [y, m] = d.split("-").map(Number); let mm = m + delta, yy = y; while (mm < 1) { mm += 12; yy--; } while (mm > 12) { mm -= 12; yy++; } return ymd(yy, mm, 1); };
const DOW = ["M", "T", "W", "T", "F", "S", "S"];

const isFreeConsult = (name?: string | null) => /free.*consult/i.test(name || "");
const cleanType = (name?: string | null) => (name || "").replace(/\s*-\s*(in\s*person|online|virtual)\b/i, "").replace(/\s{2,}/g, " ").trim();

// Heatmap shades are fixed per the design (allowed exception to tokens-only).
const shadeOf = (n: number) => (n === 0 ? "var(--track)" : n === 1 ? "#E6F2F1" : n <= 3 ? "#D5E9E8" : n === 4 ? "#A8D3D4" : "#6FB6B9");

const Chevron = () => (
  <svg className="mcal2-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
);
const Check = () => (
  <svg className="mcal2-check" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7" /></svg>
);

export default function MobileCalendar({ appts, types, today, clinicians, who, myId }: { appts: Appt[]; types: Type[]; today: string; clinicians: { id: string; name: string }[]; who: string; myId: string }) {
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(today);
  const showAll = who === "all";
  const clinName = (id?: string) => (id ? (clinicians.find((c) => c.id === id)?.name || "") : "");

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const live = useMemo(() => appts.filter((a) => a.status !== "cancelled"), [appts]);
  const byDay = useMemo(() => {
    const m = new Map<string, Appt[]>();
    for (const a of [...live].sort((x, y) => x.startAt.localeCompare(y.startAt))) {
      const k = cayDate(a.startAt); (m.get(k) || m.set(k, []).get(k)!).push(a);
    }
    return m;
  }, [live]);
  const countOf = (d: string) => byDay.get(d)?.length || 0;

  const prev = () => setAnchor((a) => (view === "month" ? monthShift(a, -1) : addDays(a, -7)));
  const next = () => setAnchor((a) => (view === "month" ? monthShift(a, 1) : addDays(a, 7)));

  const dotVar = (a: Appt) => { const t = a.typeId ? typeById.get(a.typeId) : undefined; return isFreeConsult(t?.name) ? "var(--t3-fg)" : a.capacity > 1 ? "var(--t2-fg)" : "var(--t1-fg)"; };
  const titleOf = (a: Appt) => { const t = a.typeId ? typeById.get(a.typeId) : undefined; return a.capacity > 1 ? (cleanType(t?.name) || "Group session") : (a.clientName || "Appointment"); };
  const subOf = (a: Appt) => {
    const t = a.typeId ? typeById.get(a.typeId) : undefined;
    const mode = a.mode === "virtual" ? "Online" : "In person";
    const base = a.capacity > 1 ? `${a.capacity} people · ${mode}` : `${cleanType(t?.name) || "Appointment"} · ${mode}`;
    const pieces = [base];
    if (showAll && a.clinicianId) pieces.push(lastName(clinName(a.clinicianId)));
    if (a.capacity <= 1 && a.intakeStatus === "pending") pieces.push("intake due");
    return pieces.join(" · ");
  };

  // Header titles
  const weekStart = mondayOf(anchor), weekEnd = addDays(weekStart, 6);
  const [ay, am] = anchor.split("-").map(Number);
  const monthTitle = new Date(Date.UTC(ay, am - 1, 1)).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
  const ws = parts(weekStart), we = parts(weekEnd);
  const sameMonth = ws.getUTCMonth() === we.getUTCMonth();
  const weekTitle = sameMonth
    ? `${ws.getUTCDate()} to ${we.getUTCDate()} ${we.toLocaleDateString("en-GB", { timeZone: "UTC", month: "short" })}`
    : `${ws.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" })} to ${we.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" })}`;

  // Month grid cells (Monday-first)
  const first = new Date(Date.UTC(ay, am - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const dim = new Date(Date.UTC(ay, am, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const atToday = view === "month" ? (ay === Number(today.slice(0, 4)) && am === Number(today.slice(5, 7))) : (mondayOf(today) === weekStart);

  const Row = ({ a, last }: { a: Appt; last: boolean }) => {
    const lbl = label12(cayMin(a.startAt));
    return (
      <a className={`mcal2-row${last ? " last" : ""}`} href={`/m/appt/${a.id}`}>
        <span className="mcal2-row-time"><b>{lbl.t}</b><small>{lbl.ap}</small></span>
        <span className="mcal2-row-dot" style={{ background: dotVar(a) }} aria-hidden="true" />
        <span className="mcal2-row-main">
          <span className="mcal2-row-title">{titleOf(a)}</span>
          <span className="mcal2-row-sub">{subOf(a)}</span>
        </span>
        {a.billingSessionId ? <span className="mcal2-row-logged" title="Logged"><Check /></span> : null}
        <span className="mcal2-row-go"><Chevron /></span>
      </a>
    );
  };

  return (
    <div className="mcal2">
      <header className="mcal2-head">
        <div className="meyebrow">Calendar</div>
        <div className="mcal2-titlerow">
          <h1 className="mcal2-title">{view === "month" ? monthTitle : weekTitle}</h1>
          <div className="mseg mcal2-seg" role="tablist">
            <button role="tab" aria-selected={view === "week"} className={view === "week" ? "on" : ""} onClick={() => setView("week")}>Week</button>
            <button role="tab" aria-selected={view === "month"} className={view === "month" ? "on" : ""} onClick={() => setView("month")}>Month</button>
          </div>
        </div>
        <div className="mcal2-navrow">
          <button className="mcal2-nav" onClick={prev} aria-label={view === "month" ? "Previous month" : "Previous week"}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg></button>
          {!atToday ? <button className="mcal2-jump" onClick={() => setAnchor(today)}>Today</button> : <span className="mcal2-jump-spacer" aria-hidden="true" />}
          <button className="mcal2-nav" onClick={next} aria-label={view === "month" ? "Next month" : "Next week"}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>
        </div>
      </header>

      <div className="mcal2-who"><MobileWhoPicker clinicians={clinicians} who={who} myId={myId} /></div>

      {view === "month" ? (
        <div className="mcal2-month">
          <div className="mcal2-dow">{DOW.map((d, i) => <span key={i}>{d}</span>)}</div>
          <div className="mcal2-grid">
            {cells.map((d, i) => {
              if (d === null) return <span key={`b${i}`} className="mcal2-cell blank" />;
              const date = ymd(ay, am, d);
              const n = countOf(date);
              const past = date < today;
              const sel = date === today;
              return (
                <a key={date} href={`/m?d=${date}`} className={`mcal2-cell${sel ? " sel" : ""}${past ? " past" : ""}`} style={{ background: shadeOf(n) }}>
                  <span className="mcal2-cell-n">{d}</span>
                  <span className="mcal2-cell-c">{n ? n : ""}</span>
                </a>
              );
            })}
          </div>
          <div className="mcal2-legend">
            <span>Lighter</span>
            <span className="mcal2-swatch" style={{ background: "var(--track)" }} />
            <span className="mcal2-swatch" style={{ background: "#E6F2F1" }} />
            <span className="mcal2-swatch" style={{ background: "#D5E9E8" }} />
            <span className="mcal2-swatch" style={{ background: "#A8D3D4" }} />
            <span className="mcal2-swatch" style={{ background: "#6FB6B9" }} />
            <span>Busier</span>
          </div>
        </div>
      ) : (
        <div className="mcal2-week">
          {weekDays.map((d) => {
            const day = byDay.get(d) || [];
            const pd = parts(d);
            const isToday = d === today;
            const head = `${pd.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long" })}, ${pd.getUTCDate()} ${pd.toLocaleDateString("en-GB", { timeZone: "UTC", month: "short" })}`;
            return (
              <div key={d} className="mcal2-day">
                <a className={`mcal2-dayhead${isToday ? " today" : ""}`} href={`/m?d=${d}`}>
                  <span className="mcal2-dayhead-l">{head}{isToday ? " · Today" : ""}</span>
                  <span className="mcal2-dayhead-c">{day.length ? `${day.length} session${day.length === 1 ? "" : "s"}` : ""}</span>
                </a>
                {day.length ? (
                  <div className="mcal2-card">{day.map((a, j) => <Row key={a.id} a={a} last={j === day.length - 1} />)}</div>
                ) : (
                  <div className="mcal2-empty">Nothing booked</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
