"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type T = { id: string; name: string; durationMin: number; mode: string; category: string };
const CAY = 5;
const utcFromCay = (date: string, hhmm: string) => { const [y, m, d] = date.split("-").map(Number); const [h, mi] = hhmm.split(":").map(Number); return new Date(Date.UTC(y, m - 1, d, CAY + h, mi)).toISOString(); };
const modeLabel = (m: string) => (m === "virtual" ? "Online" : m === "in_person" ? "In person" : "Either");

export default function MobileBook({ clinicianId, today, types }: { clinicianId: string; today: string; types: T[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [typeId, setTypeId] = useState("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("09:00");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const type = types.find((t) => t.id === typeId);
  const cats = [...new Set(types.map((t) => t.category))];
  const STEPS = ["Client", "Service", "When"];

  const next = () => {
    setErr("");
    if (step === 0 && !name.trim()) return setErr("Enter the client's name.");
    if (step === 1 && !typeId) return setErr("Pick a service.");
    setStep((s) => s + 1);
  };

  async function book() {
    if (!type) { setErr("Pick a service."); setStep(1); return; }
    if (!date || !time) return setErr("Pick a date and time.");
    setBusy(true); setErr("");
    try {
      const startAt = utcFromCay(date, time);
      const endAt = new Date(Date.parse(startAt) + type.durationMin * 60000).toISOString();
      const res = await fetch("/api/scheduling/appointments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", clinicianId, kind: "appointment", clientName: name.trim(), clientEmail: email.trim(), typeId, mode: type.mode, startAt, endAt, notifyClient: notify }),
      });
      const d = await res.json();
      if (res.ok) { router.push(`/m?d=${date}`); router.refresh(); }
      else { setErr(d.error || "Couldn't book the appointment."); setBusy(false); }
    } catch { setErr("Couldn't book the appointment."); setBusy(false); }
  }

  return (
    <div className="mbk">
      <header className="mbk-head">
        <a href="/m" className="mbk-x" aria-label="Close">✕</a>
        <div className="mbk-title">New appointment</div>
        <div className="mbk-steps">{STEPS.map((s, i) => <span key={s} className={i === step ? "on" : i < step ? "done" : ""}>{i < step ? "✓ " : ""}{s}</span>)}</div>
      </header>

      <div className="mbk-body">
        {step === 0 && (
          <>
            <div className="madet-f"><label>Client name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" autoFocus /></div>
            <div className="madet-f"><label>Client email (optional)</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="for confirmation and reminders" /></div>
          </>
        )}

        {step === 1 && (
          <div className="mbk-types">
            {cats.map((cat) => (
              <div key={cat}>
                <div className="mbk-cat">{cat}</div>
                {types.filter((t) => t.category === cat).map((t) => (
                  <button key={t.id} className={`mbk-type${typeId === t.id ? " on" : ""}`} onClick={() => { setTypeId(t.id); setErr(""); setStep(2); }}>
                    <span>{t.name}</span>
                    <small>{t.durationMin} min · {modeLabel(t.mode)}</small>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        {step === 2 && (
          <>
            <div className="mbk-summary">{name} · {type?.name}</div>
            <div className="madet-f"><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="madet-f"><label>Start time</label><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
            <label className="madet-toggle"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email the client their confirmation</label>
          </>
        )}

        {err && <div className="madet-msg err">{err}</div>}
      </div>

      <div className="mbk-foot">
        {step > 0 && <button className="mag-btn ghost" onClick={() => { setErr(""); setStep((s) => s - 1); }}>Back</button>}
        {step < 2
          ? <button className="mag-btn primary" onClick={next}>Continue</button>
          : <button className="mag-btn primary" disabled={busy} onClick={book}>{busy ? "Booking…" : "Book appointment"}</button>}
      </div>
    </div>
  );
}
