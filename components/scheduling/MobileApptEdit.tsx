"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type T = { id: string; name: string; durationMin: number; mode: string; category: string };
type Init = { clientName: string; clientEmail: string; typeId: string | null; mode: string; date: string; time: string; notes: string };

const CAY = 5;
const utcFromCay = (date: string, hhmm: string) => { const [y, m, d] = date.split("-").map(Number); const [h, mi] = hhmm.split(":").map(Number); return new Date(Date.UTC(y, m - 1, d, CAY + h, mi)).toISOString(); };

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

  const cats = [...new Set(types.map((t) => t.category))];
  const type = types.find((t) => t.id === typeId);

  async function save() {
    if (!clientName.trim()) return setErr("Enter the client's name.");
    if (!date || !time) return setErr("Pick a date and time.");
    setBusy(true); setErr("");
    try {
      const startAt = utcFromCay(date, time);
      const dur = type?.durationMin ?? 50;
      const endAt = new Date(Date.parse(startAt) + dur * 60000).toISOString();
      const res = await fetch("/api/scheduling/appointments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id, clientName: clientName.trim(), clientEmail: clientEmail.trim(), typeId: typeId || null, mode, startAt, endAt, notes: notes.trim(), notifyClient: notify }),
      });
      const d = await res.json();
      if (res.ok) { router.push(`/m/appt/${id}`); router.refresh(); }
      else { setErr(d.error || "Couldn't save the changes."); setBusy(false); }
    } catch { setErr("Couldn't save the changes."); setBusy(false); }
  }

  return (
    <div className="mbk">
      <header className="mbk-head">
        <a href={`/m/appt/${id}`} className="mbk-x" aria-label="Back"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg></a>
        <div className="mbk-title">Edit appointment</div>
      </header>

      <div className="mbk-body">
        <div className="mbk-card">
          <div className="madet-f"><label>Client name</label><input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Full name" /></div>
          <div className="madet-f" style={{ marginBottom: 0 }}><label>Client email</label><input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="name@email.com" /></div>
        </div>

        <div className="mbk-card" style={{ marginTop: 12 }}>
          <div className="madet-f"><label>Service</label>
            <select className="mbk-select" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              {cats.map((cat) => <optgroup key={cat} label={cat}>{types.filter((t) => t.category === cat).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.durationMin}m)</option>)}</optgroup>)}
            </select>
          </div>
          <div className="madet-f" style={{ marginBottom: 0 }}><label>Mode</label>
            <div className="medit-seg">
              <button type="button" className={mode === "in_person" ? "on" : ""} onClick={() => setMode("in_person")}>In person</button>
              <button type="button" className={mode === "virtual" ? "on" : ""} onClick={() => setMode("virtual")}>Online</button>
            </div>
          </div>
        </div>

        <div className="mbk-card" style={{ marginTop: 12 }}>
          <div className="madet-f"><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="madet-f" style={{ marginBottom: 0 }}><label>Start time</label><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        </div>

        <div className="mbk-card" style={{ marginTop: 12 }}>
          <div className="madet-f" style={{ marginBottom: 0 }}><label>Notes <span className="mbk-opt">optional</span></label><textarea className="medit-ta" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>

        <label className="madet-toggle"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email the client if the time changed</label>

        {err && <div className="madet-msg err">{err}</div>}
      </div>

      <div className="mbk-foot">
        <a className="mag-btn ghost" href={`/m/appt/${id}`} style={{ flex: 1, lineHeight: "1.5" }}>Cancel</a>
        <button className="mag-btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save changes"}</button>
      </div>
    </div>
  );
}
