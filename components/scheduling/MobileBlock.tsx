"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CAY = 5;
const utcFromCay = (date: string, hhmm: string) => { const [y, m, d] = date.split("-").map(Number); const [h, mi] = hhmm.split(":").map(Number); return new Date(Date.UTC(y, m - 1, d, CAY + h, mi)).toISOString(); };
const utcAtCayMidnight = (date: string) => { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, CAY, 0)).toISOString(); };
const utcCayEndOfDay = (date: string) => { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, CAY + 23, 59)).toISOString(); };

export default function MobileBlock({ clinicianId, today }: { clinicianId: string; today: string }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [date, setDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [time, setTime] = useState("12:00");
  const [len, setLen] = useState(60);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function create() {
    if (!date) return setErr("Pick a date.");
    setBusy(true); setErr("");
    try {
      let body: Record<string, unknown>;
      if (allDay) {
        const to = toDate && toDate >= date ? toDate : date;
        body = { action: "create", kind: "block", clinicianId, title: label.trim(), allDay: true, blockFrom: date, blockThrough: to, startAt: utcAtCayMidnight(date), endAt: utcCayEndOfDay(date), notifyClient: false };
      } else {
        const startAt = utcFromCay(date, time);
        const endAt = new Date(Date.parse(startAt) + len * 60000).toISOString();
        body = { action: "create", kind: "block", clinicianId, title: label.trim(), startAt, endAt, notifyClient: false };
      }
      const res = await fetch("/api/scheduling/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (res.ok) { router.push(`/m?d=${date}`); router.refresh(); }
      else { setErr(d.error || "Couldn't block the time."); setBusy(false); }
    } catch { setErr("Couldn't block the time."); setBusy(false); }
  }

  return (
    <div className="mbk">
      <header className="mbk-head">
        <a href="/m" className="mbk-x" aria-label="Close"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></a>
        <div className="mbk-title">Block off time</div>
      </header>

      <div className="mbk-body">
        <div className="mbk-card">
          <div className="madet-f" style={{ marginBottom: 0 }}><label>Label <span className="mbk-opt">optional</span></label><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Lunch, Leave, Admin" autoFocus /></div>
        </div>

        <label className="madet-toggle" style={{ marginTop: 14 }}><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> Block whole day(s)</label>

        {allDay ? (
          <div className="mbk-card" style={{ marginTop: 6 }}>
            <div className="madet-f"><label>From</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="madet-f" style={{ marginBottom: 0 }}><label>To</label><input type="date" value={toDate} min={date} onChange={(e) => setToDate(e.target.value)} /></div>
          </div>
        ) : (
          <div className="mbk-card" style={{ marginTop: 6 }}>
            <div className="madet-f"><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="madet-f"><label>Start time</label><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
            <div className="madet-f" style={{ marginBottom: 0 }}><label>Length</label>
              <div className="medit-seg" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
                {[30, 60, 90, 120].map((m) => <button key={m} type="button" className={len === m ? "on" : ""} onClick={() => setLen(m)}>{m < 60 ? `${m}m` : `${m / 60}h`}</button>)}
              </div>
            </div>
          </div>
        )}

        {err && <div className="madet-msg err">{err}</div>}
      </div>

      <div className="mbk-foot">
        <a className="mag-btn ghost" href="/m" style={{ flex: 1, lineHeight: "1.5" }}>Cancel</a>
        <button className="mag-btn primary" disabled={busy} onClick={create}>{busy ? "Blocking…" : "Block it off"}</button>
      </div>
    </div>
  );
}
