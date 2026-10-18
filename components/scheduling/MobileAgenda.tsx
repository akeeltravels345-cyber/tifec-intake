"use client";

import { useMemo, useState } from "react";
import InstallPrompt from "@/components/InstallPrompt";

type Appt = {
  id: string; startAt: string; endAt: string; clientName: string; typeId: string | null;
  mode: "in_person" | "virtual" | "either"; status: string; capacity: number;
  locationOrLink: string; billingSessionId: string | null; intakeStatus: string;
  insurancePath: string | null; insurerId: string | null; seriesId: string | null;
};
type Type = { id: string; name: string; mode: string; capacity: number };

const CAY = 5; // Cayman UTC-5, no DST
const cayDate = (iso: string) => new Date(Date.parse(iso) - CAY * 3600e3).toISOString().slice(0, 10);
const cayMin = (iso: string) => { const d = new Date(Date.parse(iso) - CAY * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const label12 = (min: number) => { let h = Math.floor(min / 60); const m = min % 60; const ap = h < 12 ? "am" : "pm"; h = h % 12 || 12; return { t: `${h}${m ? ":" + String(m).padStart(2, "0") : ""}`, ap }; };
const addDays = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const mondayOf = (d: string) => { const [y, m, dd] = d.split("-").map(Number); const w = (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7; return addDays(d, -w); };
const parts = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd)); };
const DOW = ["M", "T", "W", "T", "F", "S", "S"];

const isFreeConsult = (name?: string | null) => /free\b.*consult/i.test(name || "");
const cleanType = (name?: string | null) => (name || "").replace(/\s*-\s*(in\s*person|online|virtual)\b/i, "").replace(/\s{2,}/g, " ").trim();
const initialsOf = (name: string) => {
  const words = name.replace(/\b(dr|mr|mrs|ms|mx|prof)\.?\b/gi, "").split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "?";
};
const isLink = (v: string) => /^https?:\/\//.test(v || "");

export default function MobileAgenda({ appts, types, todayCayman, clinicianName }: { appts: Appt[]; types: Type[]; todayCayman: string; clinicianName: string }) {
  const [selected, setSelected] = useState(todayCayman);
  const [weekStart, setWeekStart] = useState(mondayOf(todayCayman));
  const [sheet, setSheet] = useState<Appt | null>(null);

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const live = useMemo(() => appts.filter((a) => a.status !== "cancelled"), [appts]);
  const daysWithAppts = useMemo(() => new Set(live.map((a) => cayDate(a.startAt))), [live]);

  const dayList = useMemo(() =>
    live.filter((a) => cayDate(a.startAt) === selected).sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [live, selected]);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const selDate = parts(selected);
  const headDow = selDate.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long" });
  const headDate = selDate.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "long" });

  const accentOf = (a: Appt) => { const t = a.typeId ? typeById.get(a.typeId) : undefined; return isFreeConsult(t?.name) ? "#D85A30" : (a.capacity > 1 ? "#2E3192" : "#2F8E93"); };
  const titleOf = (a: Appt) => { const t = a.typeId ? typeById.get(a.typeId) : undefined; return a.capacity > 1 ? (cleanType(t?.name) || "Group session") : (a.clientName || "Appointment"); };
  const subOf = (a: Appt) => { const t = a.typeId ? typeById.get(a.typeId) : undefined; return a.capacity > 1 ? `${a.capacity} people` : (cleanType(t?.name) || "Appointment"); };

  const pickDay = (d: string) => { setSelected(d); if (d < weekStart || d > addDays(weekStart, 6)) setWeekStart(mondayOf(d)); };

  return (
    <div className="mag">
      <header className="mag-head">
        <div className="mag-head-row">
          <div>
            <div className="mag-dow">{headDow}</div>
            <div className="mag-date">{headDate}</div>
          </div>
          <div className="mag-av">{initialsOf(clinicianName)}</div>
        </div>
        <div className="mag-strip">
          <button className="mag-wk" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</button>
          {weekDays.map((d, i) => {
            const on = d === selected, isToday = d === todayCayman, has = daysWithAppts.has(d);
            return (
              <button key={d} className={`mag-day${on ? " on" : ""}`} onClick={() => pickDay(d)} aria-label={d} aria-current={on ? "date" : undefined}>
                <span className="mag-day-l">{DOW[i]}</span>
                <span className={`mag-day-n${isToday && !on ? " today" : ""}`}>{parts(d).getUTCDate()}</span>
                <span className={`mag-dot${has ? " show" : ""}`} aria-hidden="true" />
              </button>
            );
          })}
          <button className="mag-wk" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>›</button>
        </div>
      </header>

      <div className="mag-body">
        <InstallPrompt />
        <div className="mag-count">{dayList.length === 0 ? "No appointments" : `${dayList.length} appointment${dayList.length === 1 ? "" : "s"}`}</div>

        {dayList.length === 0 ? (
          <div className="mag-empty">
            <span className="mag-empty-ic" aria-hidden="true">✦</span>
            <p>Nothing booked for this day.</p>
            <a className="mag-empty-btn" href="/m/book">Book an appointment</a>
          </div>
        ) : (
          <div className="mag-list">
            {dayList.map((a) => {
              const s = cayMin(a.startAt), lbl = label12(s);
              const virtual = a.mode === "virtual";
              return (
                <button key={a.id} className="mag-card" style={{ borderLeftColor: accentOf(a) }} onClick={() => setSheet(a)}>
                  <span className="mag-card-time"><b>{lbl.t}</b><small>{lbl.ap}</small></span>
                  <span className="mag-card-main">
                    <span className="mag-card-name">{titleOf(a)}</span>
                    <span className="mag-card-sub">{subOf(a)}</span>
                    <span className="mag-card-mode">
                      {virtual ? <><Ic n="video" /> Online</> : <><Ic n="pin" /> In person</>}
                      {a.billingSessionId ? <span className="mag-logged">· ✓ logged</span> : a.intakeStatus === "pending" ? <span className="mag-intake">· intake due</span> : null}
                    </span>
                  </span>
                  <span className="mag-card-go" aria-hidden="true">›</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <a className="mag-fab" href="/m/book" aria-label="Book an appointment"><Ic n="plus" /></a>

      {sheet && (() => {
        const t = sheet.typeId ? typeById.get(sheet.typeId) : undefined;
        const s = cayMin(sheet.startAt), e = cayMin(sheet.endAt);
        const ls = label12(s), le = label12(e);
        const virtual = sheet.mode === "virtual";
        const d = parts(cayDate(sheet.startAt));
        const when = `${d.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })} · ${ls.t}${ls.ap}–${le.t}${le.ap}`;
        return (
          <div className="mag-sheet-ov" onClick={() => setSheet(null)}>
            <div className="mag-sheet" onClick={(ev) => ev.stopPropagation()}>
              <div className="mag-sheet-grab" aria-hidden="true" />
              <div className="mag-sheet-head">
                <div className="mag-sheet-name">{titleOf(sheet)}</div>
                <div className="mag-sheet-sub">{cleanType(t?.name) || "Appointment"} · {when}</div>
              </div>
              {virtual && isLink(sheet.locationOrLink) && (
                <a className="mag-sheet-join" href={sheet.locationOrLink} target="_blank" rel="noopener noreferrer"><Ic n="video" /> Join video call</a>
              )}
              <div className="mag-sheet-rows">
                <div><span>Mode</span><b>{virtual ? "Online" : "In person"}</b></div>
                <div><span>Payment</span><b>{sheet.insurancePath === "insurance" ? "Insurance" : "Self-pay"}</b></div>
                <div><span>Intake</span><b>{sheet.intakeStatus === "received" ? "Complete" : sheet.intakeStatus === "pending" ? "Outstanding" : "Not required"}</b></div>
              </div>
              <div className="mag-sheet-actions">
                {sheet.billingSessionId
                  ? <div className="mag-done">✓ Logged for billing</div>
                  : <a className="mag-btn primary" href={`/billing/sessions/new?fromAppt=${sheet.id}`}>Log this session</a>}
                <button className="mag-btn ghost" onClick={() => setSheet(null)}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function Ic({ n }: { n: "video" | "pin" | "plus" }) {
  const common = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (n === "video") return (<svg {...common}><path d="M15 10l5-3v10l-5-3" /><rect x="3" y="6" width="12" height="12" rx="2" /></svg>);
  if (n === "pin") return (<svg {...common}><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>);
  return (<svg {...{ ...common, width: 24, height: 24, strokeWidth: 2.2 }}><path d="M12 5v14M5 12h14" /></svg>);
}
