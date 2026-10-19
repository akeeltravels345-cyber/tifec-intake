"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import "./mobile-edit.css";

type T = { id: string; name: string; durationMin: number; mode: string; category: string };
type Init = { clientName: string; clientEmail: string; typeId: string | null; mode: string; date: string; time: string; notes: string };

const CAY = 5; // Cayman is UTC-5, no DST
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Build a UTC instant from a Cayman wall-clock date + time.
const utcFromCay = (date: string, hhmm: string) => { const [y, m, d] = date.split("-").map(Number); const [h, mi] = hhmm.split(":").map(Number); return new Date(Date.UTC(y, m - 1, d, CAY + h, mi)).toISOString(); };
// Today's date in Cayman wall-clock terms.
const cayToday = () => new Date(Date.now() - CAY * 3600e3).toISOString().slice(0, 10);

const hmToMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };
const minToHM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const label12 = (min: number) => { const h = Math.floor(min / 60), m = min % 60; const ap = h < 12 ? "am" : "pm"; const h12 = h % 12 === 0 ? 12 : h % 12; return `${h12}:${String(m).padStart(2, "0")}${ap}`; };

const addDays = (date: string, n: number) => { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const dowOf = (date: string) => { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const dayNum = (date: string) => Number(date.split("-")[2]);

export default function MobileApptEdit({ id, types, initial }: { id: string; types: T[]; initial: Init }) {
  const router = useRouter();
  const [clientName, setClientName] = useState(initial.clientName);
  const [clientEmail, setClientEmail] = useState(initial.clientEmail);
  const [typeId, setTypeId] = useState(initial.typeId || "");
  const [mode, setMode] = useState(initial.mode === "virtual" ? "virtual" : "in_person");
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [notes, setNotes] = useState(initial.notes || "");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const type = types.find((t) => t.id === typeId);
  const dur = type?.durationMin ?? 50;

  // Day chips: from today (or the appointment's own day if it is earlier) through
  // two weeks out, so the current slot's day is always reachable.
  const today = cayToday();
  const start = initial.date < today ? initial.date : today;
  const end = addDays(today, 14);
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  // Start-time grid: candidate slots inside working hours (08:00 to 18:00, every
  // 30 min), with the current slot always included even if it falls off the grid.
  // TODO: these are candidate times, not conflict-filtered free slots. Excluding
  // busy appointments (minus this one) needs the day's booked intervals on the
  // client, which no API currently exposes (availability returns config only, and
  // availableSlots() is server-only). Add a slots endpoint, then filter here.
  const selMin = hmToMin(time);
  const slotMins: number[] = [];
  for (let t = 8 * 60; t + dur <= 18 * 60; t += 30) slotMins.push(t);
  if (!slotMins.includes(selMin)) { slotMins.push(selMin); slotMins.sort((a, b) => a - b); }

  async function save() {
    if (!clientName.trim()) return setErr("Enter the client's name.");
    if (!date || !time) return setErr("Pick a date and time.");
    setBusy(true); setErr("");
    try {
      const startAt = utcFromCay(date, time);
      const endAt = new Date(Date.parse(startAt) + dur * 60000).toISOString();
      const res = await fetch("/api/scheduling/appointments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id, clientName: clientName.trim(), clientEmail: clientEmail.trim(), typeId: typeId || null, mode, startAt, endAt, notes: notes.trim(), notifyClient: notify }),
      });
      const d = await res.json();
      if (res.ok) {
        const timeChanged = date !== initial.date || time !== initial.time;
        const emailed = timeChanged && notify && !!clientEmail.trim();
        setToast(emailed ? "Saved. Client emailed the new time" : "Changes saved");
        setTimeout(() => { router.push(`/m/appt/${id}`); router.refresh(); }, 650);
      } else { setErr(d.error || "Couldn't save the changes."); setBusy(false); }
    } catch { setErr("Couldn't save the changes."); setBusy(false); }
  }

  return (
    <div className="mflow medit2">
      <header className="mflow-head">
        <a href={`/m/appt/${id}`} className="mflow-x" aria-label="Back"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg></a>
        <div className="mflow-title">Edit appointment</div>
      </header>

      <div className="mflow-body">
        <div className="mcard">
          <div className="mfield"><label>Client name</label><input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Full name" /></div>
          <div className="mfield"><label>Client email</label><input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="name@email.com" /></div>
        </div>

        <div className="mcard">
          <span className="medit2-lbl">Service</span>
          <div className="medit2-chips">
            {types.map((t) => (
              <button key={t.id} type="button" className={`medit2-chip${typeId === t.id ? " on" : ""}`} onClick={() => setTypeId(t.id)}>{t.name}</button>
            ))}
          </div>
          <span className="medit2-lbl mt">Mode</span>
          <div className="mseg">
            <button type="button" className={mode === "in_person" ? "on" : ""} onClick={() => setMode("in_person")}>In person</button>
            <button type="button" className={mode === "virtual" ? "on" : ""} onClick={() => setMode("virtual")}>Online</button>
          </div>
        </div>

        <div className="mcard">
          <span className="medit2-lbl">Day</span>
          <div className="medit2-days">
            {days.map((d) => (
              <button key={d} type="button" className={`medit2-day${date === d ? " on" : ""}`} onClick={() => setDate(d)}>
                <span className="dow">{DOW[dowOf(d)]}</span>
                <span className="num">{dayNum(d)}</span>
              </button>
            ))}
          </div>
          <span className="medit2-lbl mt">Start time</span>
          <div className="medit2-grid">
            {slotMins.map((t) => (
              <button key={t} type="button" className={`medit2-slot${selMin === t ? " on" : ""}`} onClick={() => setTime(minToHM(t))}>{label12(t)}</button>
            ))}
          </div>
          <p className="medit2-hint">Times shown are within working hours.</p>
        </div>

        <div className="mcard">
          <div className="mfield"><label>Notes <span className="medit2-opt">optional</span></label><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Visible to clinicians only" /></div>
        </div>

        <div className="medit2-toggle-row">
          <span>Email the client if the time changed</span>
          <button type="button" role="switch" aria-checked={notify} aria-label="Email the client if the time changed" className={`mtoggle${notify ? " on" : ""}`} onClick={() => setNotify((v) => !v)}><span /></button>
        </div>

        {err && <div className="mmsg err">{err}</div>}
      </div>

      <div className="mflow-foot">
        <a className="mbtn ghost medit2-cancel" href={`/m/appt/${id}`}>Cancel</a>
        <button className="mbtn primary medit2-save" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save changes"}</button>
      </div>

      {toast && <div className="mtoast">{toast}</div>}
    </div>
  );
}
