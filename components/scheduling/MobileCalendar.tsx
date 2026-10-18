"use client";

import { useMemo, useState } from "react";

type Appt = { id: string; startAt: string; endAt: string; clientName: string; typeId: string | null; mode: string; status: string; capacity: number; billingSessionId: string | null; intakeStatus: string };
type Type = { id: string; name: string; capacity: number };

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

const isFreeConsult = (name?: string | null) => /free\b.*consult/i.test(name || "");
const cleanType = (name?: string | null) => (name || "").replace(/\s*-\s*(in\s*person|online|virtual)\b/i, "").replace(/\s{2,}/g, " ").trim();

export default function MobileCalendar({ appts, types, today }: { appts: Appt[]; types: Type[]; today: string }) {
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(today);

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const live = useMemo(() => appts.filter((a) => a.status !== "cancelled"), [appts]);
  const has = useMemo(() => new Set(live.map((a) => cayDate(a.startAt))), [live]);
  const byDay = useMemo(() => {
    const m = new Map<string, Appt[]>();
    for (const a of [...live].sort((x, y) => x.startAt.localeCompare(y.startAt))) {
      const k = cayDate(a.startAt); (m.get(k) || m.set(k, []).get(k)!).push(a);
    }
    return m;
  }, [live]);

  const prev = () => setAnchor((a) => (view === "month" ? monthShift(a, -1) : addDays(a, -7)));
  const next = () => setAnchor((a) => (view === "month" ? monthShift(a, 1) : addDays(a, 7)));

  const accentOf = (a: Appt) => { const t = a.typeId ? typeById.get(a.typeId) : undefined; return isFreeConsult(t?.name) ? "#D85A30" : (a.capacity > 1 ? "#2E3192" : "#2F8E93"); };
  const titleOf = (a: Appt) => { const t = a.typeId ? typeById.get(a.typeId) : undefined; return a.capacity > 1 ? (cleanType(t?.name) || "Group session") : (a.clientName || "Appointment"); };
  const subOf = (a: Appt) => { const t = a.typeId ? typeById.get(a.typeId) : undefined; return a.capacity > 1 ? `${a.capacity} people` : (cleanType(t?.name) || "Appointment"); };

  // header title
  const weekStart = mondayOf(anchor), weekEnd = addDays(weekStart, 6);
  const [ay, am] = anchor.split("-").map(Number);
  const monthTitle = new Date(Date.UTC(ay, am - 1, 1)).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
  const ws = parts(weekStart), we = parts(weekEnd);
  const sameMonth = ws.getUTCMonth() === we.getUTCMonth();
  const weekTitle = sameMonth
    ? `${ws.getUTCDate()} – ${we.getUTCDate()} ${we.toLocaleDateString("en-GB", { timeZone: "UTC", month: "short" })}`
    : `${ws.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" })} – ${we.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" })}`;

  // month grid cells
  const first = new Date(Date.UTC(ay, am - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const dim = new Date(Date.UTC(ay, am, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const Card = ({ a }: { a: Appt }) => {
    const lbl = label12(cayMin(a.startAt));
    return (
      <a className="mag-card" style={{ borderLeftColor: accentOf(a) }} href={`/m/appt/${a.id}`}>
        <span className="mag-card-time"><b>{lbl.t}</b><small>{lbl.ap}</small></span>
        <span className="mag-card-main">
          <span className="mag-card-name">{titleOf(a)}</span>
          <span className="mag-card-sub">{subOf(a)}</span>
          <span className="mag-card-mode">
            {a.mode === "virtual" ? "Online" : "In person"}
            {a.billingSessionId ? <span className="mag-logged">· ✓ logged</span> : a.intakeStatus === "pending" ? <span className="mag-intake">· intake due</span> : null}
          </span>
        </span>
        <span className="mag-card-go" aria-hidden="true">›</span>
      </a>
    );
  };

  return (
    <div className="mcal">
      <header className="mcal-head">
        <div className="mcal-navrow">
          <button className="mcal-nav" onClick={prev} aria-label={view === "month" ? "Previous month" : "Previous week"}>‹</button>
          <div className="mcal-month">{view === "month" ? monthTitle : weekTitle}</div>
          <button className="mcal-nav" onClick={next} aria-label={view === "month" ? "Next month" : "Next week"}>›</button>
        </div>
        <div className="mcal-seg" role="tablist">
          <button role="tab" aria-selected={view === "week"} className={view === "week" ? "on" : ""} onClick={() => setView("week")}>Week</button>
          <button role="tab" aria-selected={view === "month"} className={view === "month" ? "on" : ""} onClick={() => setView("month")}>Month</button>
        </div>
      </header>

      {view === "month" ? (
        <div className="mcal-body">
          <div className="mcal-dow">{DOW.map((d, i) => <span key={i}>{d}</span>)}</div>
          <div className="mcal-grid">
            {cells.map((d, i) => {
              if (d === null) return <span key={`b${i}`} className="mcal-cell blank" />;
              const date = ymd(ay, am, d);
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
      ) : (
        <div className="mcal-week">
          {weekDays.map((d) => {
            const day = byDay.get(d) || [];
            const pd = parts(d);
            return (
              <div key={d} className="mcal-wday">
                <a className={`mcal-wday-h${d === today ? " today" : ""}`} href={`/m?d=${d}`}>
                  <span>{pd.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short" })} <b>{pd.getUTCDate()}</b></span>
                  <span className="mcal-wday-c">{day.length ? `${day.length}` : ""}</span>
                </a>
                {day.length ? <div className="mcal-wlist">{day.map((a) => <Card key={a.id} a={a} />)}</div> : <div className="mcal-wnone">Nothing booked</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
