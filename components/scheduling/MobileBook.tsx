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
  const [openCat, setOpenCat] = useState<string | null>(null);

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
        <a href="/m" className="mbk-x" aria-label="Close"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></a>
        <div className="mbk-title">New appointment</div>
        <div className="mbk-stepper">
          {STEPS.map((s, i) => (
            <div key={s} className={`mbk-st${i === step ? " on" : i < step ? " done" : ""}`}>
              <span className="mbk-st-dot">{i < step ? "✓" : i + 1}</span>
              <span className="mbk-st-lb">{s}</span>
            </div>
          ))}
        </div>
      </header>

      <div className="mbk-body">
        {step === 0 && (
          <>
            <div className="mbk-h">Who&apos;s it for?</div>
            <div className="mbk-card">
              <div className="madet-f"><label>Client name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" autoFocus /></div>
              <div className="madet-f" style={{ marginBottom: 0 }}><label>Client email <span className="mbk-opt">optional</span></label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" /></div>
            </div>
            <p className="mbk-note">An email address lets us send the confirmation and any intake forms automatically.</p>
          </>
        )}

        {step === 1 && (
          <>
            <div className="mbk-h">Pick a service</div>
            <div className="mbk-cats">
              {cats.map((cat) => {
                const items = types.filter((t) => t.category === cat);
                const open = openCat === cat;
                return (
                  <div key={cat} className={`mbk-catgrp${open ? " open" : ""}`}>
                    <button className="mbk-cathead" onClick={() => setOpenCat(open ? null : cat)} aria-expanded={open}>
                      <span className="mbk-cathead-l">{cat}</span>
                      <span className="mbk-cathead-r"><span className="mbk-catcount">{items.length}</span><span className="mbk-caret2" aria-hidden="true">›</span></span>
                    </button>
                    {open && (
                      <div className="mbk-catlist">
                        {items.map((t) => (
                          <button key={t.id} className={`mbk-type${typeId === t.id ? " on" : ""}`} onClick={() => { setTypeId(t.id); setErr(""); setStep(2); }}>
                            <span className="mbk-type-main"><span>{t.name}</span><small>{t.durationMin} min · {modeLabel(t.mode)}</small></span>
                            <span className="mbk-type-go" aria-hidden="true">›</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="mbk-h">When?</div>
            <div className="mbk-summary"><span className="mbk-sum-who">{name || "Client"}</span><span className="mbk-sum-svc">{type?.name}</span></div>
            <div className="mbk-card">
              <div className="madet-f"><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="madet-f" style={{ marginBottom: 0 }}><label>Start time</label><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
            </div>
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
