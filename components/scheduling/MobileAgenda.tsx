"use client";

import { useEffect, useMemo, useState } from "react";
import InstallPrompt from "@/components/InstallPrompt";
import MobileWhoPicker from "@/components/scheduling/MobileWhoPicker";
import MobilePeekSheet, { type PeekAppt } from "@/components/scheduling/MobilePeekSheet";

type Appt = {
  id: string; startAt: string; endAt: string; clientName: string; typeId: string | null;
  mode: "in_person" | "virtual" | "either"; status: string; capacity: number;
  locationOrLink: string; billingSessionId: string | null; intakeStatus: string;
  insurancePath: string | null; insurerId: string | null; seriesId: string | null; clinicianId?: string;
  kind?: string; title?: string | null;
};
type Type = { id: string; name: string; mode: string; capacity: number };

const lastName = (name: string) => name.replace(/^\s*(dr|mr|mrs|ms|mx|prof)\.?\s+/i, "").trim().split(/\s+/).pop() || name;
const CAY = 5; // Cayman UTC-5, no DST
const cayDate = (iso: string) => new Date(Date.parse(iso) - CAY * 3600e3).toISOString().slice(0, 10);
const cayMin = (iso: string) => { const d = new Date(Date.parse(iso) - CAY * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const label12 = (min: number) => { let h = Math.floor(min / 60); const m = min % 60; const ap = h < 12 ? "am" : "pm"; h = h % 12 || 12; return { t: `${h}${m ? ":" + String(m).padStart(2, "0") : ""}`, ap }; };
const addDays = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const mondayOf = (d: string) => { const [y, m, dd] = d.split("-").map(Number); const w = (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7; return addDays(d, -w); };
const parts = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd)); };
const DOW = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

// Day grid: 8am–6pm, px per hour.
const DAY_START = 8, DAY_END = 18, HOUR = 72;
const hourLabel = (h: number) => (h === 12 ? "12pm" : h > 12 ? `${h - 12}` : `${h}`);

const isFreeConsult = (name?: string | null) => /free\b.*consult/i.test(name || "");
const cleanType = (name?: string | null) => (name || "").replace(/\s*-\s*(in\s*person|online|virtual)\b/i, "").replace(/\s{2,}/g, " ").trim();
const typeClass = (free: boolean, group: boolean) => (free ? "t3" : group ? "t2" : "t1");
const initialsOf = (name: string) => {
  const w = name.replace(/^\s*(dr|mr|mrs|ms|mx|prof)\.?\s+/i, "").trim().split(/\s+/).filter(Boolean);
  return w.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "?";
};

export default function MobileAgenda({ appts, types, todayCayman, initialDay, clinicians, who, myId }: { appts: Appt[]; types: Type[]; todayCayman: string; initialDay?: string; clinicians: { id: string; name: string }[]; who: string; myId: string }) {
  const viewingOwn = who === myId;
  const showAll = who === "all";
  const clinName = (id?: string) => (id ? (clinicians.find((c) => c.id === id)?.name || "") : "");
  const start0 = initialDay || todayCayman;
  const [selected, setSelected] = useState(start0);
  const [weekStart, setWeekStart] = useState(mondayOf(start0));
  const [peekId, setPeekId] = useState<string | null>(null);

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const live = useMemo(() => appts.filter((a) => a.status !== "cancelled"), [appts]);
  const countByDay = useMemo(() => { const m = new Map<string, number>(); for (const a of live) if (a.kind !== "block") m.set(cayDate(a.startAt), (m.get(cayDate(a.startAt)) || 0) + 1); return m; }, [live]);

  const dayList = useMemo(() =>
    live.filter((a) => a.kind !== "block" && cayDate(a.startAt) === selected).sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [live, selected]);
  const dayBlocks = useMemo(() => live.filter((a) => a.kind === "block" && cayDate(a.startAt) === selected), [live, selected]);

  // Lane-pack overlapping appointments.
  const placed = useMemo(() => {
    const items = dayList.map((a) => ({ a, s: cayMin(a.startAt), e: Math.max(cayMin(a.startAt) + 15, cayMin(a.endAt)) })).sort((x, y) => x.s - y.s || x.e - y.e);
    const lanes: number[] = [];
    const out = items.map((it) => { let lane = lanes.findIndex((end) => end <= it.s); if (lane === -1) { lane = lanes.length; lanes.push(it.e); } else lanes[lane] = it.e; return { ...it, lane }; });
    return out.map((p) => ({ ...p, laneCount: Math.max(1, lanes.length) }));
  }, [dayList]);

  // The "now" minute, client-side only.
  const [nowMin, setNowMin] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const upd = () => { const d = new Date(Date.now() - CAY * 3600e3); setNowMin(d.getUTCHours() * 60 + d.getUTCMinutes()); setNowMs(Date.now()); };
    upd(); const id = setInterval(upd, 60000); return () => clearInterval(id);
  }, []);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const selDate = parts(selected);
  const isToday = selected === todayCayman;
  const headEyebrow = isToday ? `${selDate.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long" }).toUpperCase()} · TODAY` : selDate.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long" }).toUpperCase();
  const headDate = selDate.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "long" });

  const titleOf = (a: Appt) => { const t = a.typeId ? typeById.get(a.typeId) : undefined; return a.capacity > 1 ? (cleanType(t?.name) || "Group session") : (a.clientName || "Appointment"); };
  const subOf = (a: Appt) => { const t = a.typeId ? typeById.get(a.typeId) : undefined; return a.capacity > 1 ? `${a.capacity} people` : (cleanType(t?.name) || "Appointment"); };

  const pickDay = (d: string) => { setSelected(d); if (d < weekStart || d > addDays(weekStart, 6)) setWeekStart(mondayOf(d)); };

  // Up next: the first non-block session today that starts after now.
  const upNext = useMemo(() => {
    if (!isToday) return null;
    return dayList.find((a) => Date.parse(a.startAt) > nowMs) || null;
  }, [isToday, dayList, nowMs]);
  const toLog = useMemo(() => dayList.filter((a) => Date.parse(a.endAt) <= nowMs && !a.billingSessionId).length, [dayList, nowMs]);

  const peek = peekId ? dayList.find((a) => a.id === peekId) || dayBlocks.find((a) => a.id === peekId) || null : null;
  const peekData: PeekAppt | null = peek ? {
    id: peek.id, kind: peek.kind === "block" ? "block" : "appointment", title: peek.title || "",
    clientName: peek.clientName, startAt: peek.startAt, endAt: peek.endAt, mode: peek.mode,
    typeName: cleanType((peek.typeId ? typeById.get(peek.typeId) : undefined)?.name) || "Appointment",
    capacity: peek.capacity, status: peek.status, billingSessionId: peek.billingSessionId,
    intakeStatus: peek.intakeStatus, locationOrLink: peek.locationOrLink,
    insurancePath: peek.insurancePath, typeClass: typeClass(isFreeConsult((peek.typeId ? typeById.get(peek.typeId) : undefined)?.name), peek.capacity > 1),
  } : null;

  return (
    <div className="mtoday">
      <header className="mtoday-head">
        <div>
          <div className="meyebrow">{headEyebrow}</div>
          <div className="mtoday-date">{headDate}</div>
        </div>
        {!isToday && <button className="mtoday-pill" onClick={() => pickDay(todayCayman)}>Today</button>}
      </header>

      <div className="mtoday-strip">
        <div className="mstrip-track">
          {weekDays.map((d, i) => {
            const on = d === selected, day = parts(d), weekend = i >= 5, count = countByDay.get(d) || 0;
            const barH = count ? Math.min(20, 4 + count * 4) : 0;
            return (
              <button key={d} className={`mstrip-day${on ? " on" : ""}${weekend ? " wk" : ""}`} onClick={() => pickDay(d)} aria-current={on ? "date" : undefined} aria-label={d}>
                <span className="mstrip-l">{DOW[i][0]}</span>
                <span className={`mstrip-n${d === todayCayman && !on ? " today" : ""}`}>{day.getUTCDate()}</span>
                <span className="mstrip-bar" style={{ height: barH }} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="mtoday-body">
        <InstallPrompt />

        {upNext && (() => {
          const a = upNext; const mins = Math.round((Date.parse(a.startAt) - nowMs) / 60000);
          const lblS = label12(cayMin(a.startAt)), lblE = label12(cayMin(a.endAt));
          const group = a.capacity > 1, online = a.mode === "virtual";
          const inTxt = mins <= 0 ? "NOW" : mins < 60 ? `IN ${mins} MIN` : `AT ${lblS.t}${lblS.ap}`;
          return (
            <div className="mcard mnext">
              <div className="mnext-top"><span className="meyebrow">UP NEXT · {inTxt}</span><span className="mnext-time">{lblS.t}{lblS.ap !== lblE.ap ? lblS.ap : ""}–{lblE.t}{lblE.ap}</span></div>
              <div className="mnext-title">{titleOf(a)}</div>
              <div className="mnext-meta">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{group ? <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3 2.5-4.5 6-4.5S15 17 15 20M16 5.2a3 3 0 0 1 0 5.6M21 20c0-2.2-1.3-3.7-3.5-4.2" /></> : online ? <><path d="M15 10l5-3v10l-5-3" /><rect x="3" y="6" width="12" height="12" rx="2" /></> : <><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>}</svg>
                {subOf(a)} · {online ? "Online" : "In person"}
              </div>
              <div className="mnext-actions">
                <a className="mbtn primary" href={online && a.locationOrLink ? a.locationOrLink : `/m/appt/${a.id}`} {...(online && a.locationOrLink ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{online ? "Join video" : group ? "Take attendance" : "View details"}</a>
                <button className="mnext-more" onClick={() => setPeekId(a.id)} aria-label="Quick actions"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg></button>
              </div>
            </div>
          );
        })()}
        {isToday && !upNext && dayList.length > 0 && (
          <div className="mcard mnext done"><div className="mnext-title">Nothing else today</div><div className="mnext-meta">{toLog > 0 ? `${toLog} still to log` : "Everything is logged."}</div></div>
        )}

        <div className="mtoday-sum">
          <MobileWhoPicker clinicians={clinicians} who={who} myId={myId} />
          <span className="mtoday-count">{dayList.length === 0 ? "No sessions" : `${dayList.length} session${dayList.length === 1 ? "" : "s"}`}{toLog > 0 ? <> · <span className="tolog">{toLog} to log</span></> : null}</span>
        </div>

        <div className="mgrid2" style={{ height: (DAY_END - DAY_START) * HOUR + 8 }}>
          {Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i).map((h) => (
            <div key={h} className="mgrid2-row" style={{ top: (h - DAY_START) * HOUR }}>
              <span className="mgrid2-hr">{hourLabel(h)}</span>
              <span className="mgrid2-line" />
            </div>
          ))}
          <div className="mgrid2-gutter" style={{ height: (DAY_END - DAY_START) * HOUR }} aria-hidden="true" />

          {dayBlocks.map((b) => {
            const bs = Math.max(cayMin(b.startAt), DAY_START * 60), be = Math.min(Math.max(cayMin(b.startAt) + 15, cayMin(b.endAt)), DAY_END * 60);
            if (be <= bs) return null;
            const top = ((bs - DAY_START * 60) / 60) * HOUR, height = Math.max(22, ((be - bs) / 60) * HOUR - 2);
            return <button key={b.id} className="mgrid2-block" style={{ top, height }} onClick={() => setPeekId(b.id)}><span>{(b.title || "Blocked").trim()}</span></button>;
          })}

          {isToday && nowMin != null && nowMin >= DAY_START * 60 && nowMin <= DAY_END * 60 && (
            <div className="mgrid2-now" style={{ top: ((nowMin - DAY_START * 60) / 60) * HOUR }}><span className="dot" /><span className="pill">{label12(nowMin).t}{label12(nowMin).ap}</span></div>
          )}

          <div className="mgrid2-appts">
            {placed.map((p) => {
              const a = p.a;
              const vs = Math.max(p.s, DAY_START * 60), ve = Math.min(p.e, DAY_END * 60);
              if (ve <= vs) return null;
              const top = ((vs - DAY_START * 60) / 60) * HOUR, height = Math.max(26, ((ve - vs) / 60) * HOUR - 3);
              const w = 100 / p.laneCount, left = p.lane * w;
              const t = a.typeId ? typeById.get(a.typeId) : undefined;
              const cls = typeClass(isFreeConsult(t?.name), a.capacity > 1);
              const lblS = label12(cayMin(a.startAt)), lblE = label12(cayMin(a.endAt));
              const online = a.mode === "virtual";
              const past = Date.parse(a.endAt) <= nowMs;
              const logged = !!a.billingSessionId;
              const compact = height < 54;
              return (
                <button key={a.id} className={`mgrid2-appt ${cls}${past && logged ? " done" : ""}`} style={{ top, height, left: `${left}%`, width: `calc(${w}% - 4px)` }} onClick={() => setPeekId(a.id)}>
                  {compact ? (
                    <span className="mg2-c"><b>{lblS.t}{lblS.ap}</b> {titleOf(a)}</span>
                  ) : (
                    <>
                      <span className="mg2-t">{lblS.t}{lblS.ap !== lblE.ap ? lblS.ap : ""}–{lblE.t}{lblE.ap}{online && <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginLeft: 4, verticalAlign: "-1px" }}><path d="M15 10l5-3v10l-5-3" /><rect x="3" y="6" width="12" height="12" rx="2" /></svg>}</span>
                      <span className="mg2-n">{titleOf(a)}</span>
                      {height > 84 && <span className="mg2-s">{subOf(a)}{showAll && a.clinicianId ? ` · ${lastName(clinName(a.clinicianId))}` : ""}</span>}
                      {past && !logged && <span className="mg2-tolog">To log</span>}
                      {logged && <span className="mg2-check" aria-label="Logged"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg></span>}
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {dayList.length === 0 && dayBlocks.length === 0 && (
            <div className="mgrid2-empty">
              <div className="mcard mempty">
                <div className="mempty-t">Nothing booked</div>
                <div className="mempty-s">{isToday ? "Your day is open. Share your booking link or add a session." : "No sessions on this day."}</div>
                {viewingOwn && <div className="mempty-row"><a className="mbtn ghost" href="/m/me">Share link</a><a className="mbtn primary" href={`/m/book?d=${selected}`}>Book</a></div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {peekData && <MobilePeekSheet appt={peekData} onClose={() => setPeekId(null)} />}
    </div>
  );
}

export { initialsOf };
