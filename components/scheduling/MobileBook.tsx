"use client";

import "./mobile-book.css";
import { useState } from "react";
import { useRouter } from "next/navigation";

type T = { id: string; name: string; durationMin: number; mode: string; category: string };

const CAY = 5;
const utcFromCay = (date: string, hhmm: string) => {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, CAY + h, mi)).toISOString();
};

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Pure calendar-date maths (no local-tz drift): parse/compose at UTC midnight.
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function dayParts(ymd: string): { dow: string; dowFull: string; num: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { dow: DOW[wd], dowFull: DOW_FULL[wd], num: d };
}
const label12 = (hhmm: string) => {
  const [h, mi] = hhmm.split(":").map(Number);
  const ap = h < 12 ? "am" : "pm";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return mi === 0 ? `${hr}${ap}` : `${hr}:${String(mi).padStart(2, "0")}${ap}`;
};
const modeLabel = (m: string) => (m === "virtual" ? "Online" : m === "in_person" ? "In person" : "In person or online");
const initials = (n: string) =>
  n.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

// Candidate start times inside a default working window (8am to 6pm, 30-min
// steps). The server validates true availability on submit (returns an error
// for a taken slot), so no extra API/props are needed here.
const DAY_START = 8 * 60;
const DAY_END = 18 * 60;
function slotsFor(durationMin: number): string[] {
  const out: string[] = [];
  for (let t = DAY_START; t + durationMin <= DAY_END; t += 30) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  return out;
}

const DAYS_AHEAD = 21;

export default function MobileBook({ clinicianId, today, types }: { clinicianId: string; today: string; types: T[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [typeId, setTypeId] = useState("");
  const [mode, setMode] = useState("in_person");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [openCat, setOpenCat] = useState<string | null>(null);

  const type = types.find((t) => t.id === typeId);
  const cats = [...new Set(types.map((t) => t.category))];
  const STEPS = ["Client", "Service", "When"];
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i));
  const slots = type ? slotsFor(type.durationMin) : [];

  const pickType = (t: T) => {
    setTypeId(t.id);
    setMode(t.mode === "either" ? "in_person" : t.mode);
    setTime("");
    setErr("");
    setStep(2);
  };

  const next = () => {
    setErr("");
    if (step === 0 && !name.trim()) return setErr("Enter the client's name.");
    if (step === 1 && !typeId) return setErr("Pick a service.");
    setStep((s) => s + 1);
  };

  async function book() {
    if (!type) { setErr("Pick a service."); setStep(1); return; }
    if (!time) return setErr("Pick a time.");
    setBusy(true); setErr("");
    try {
      const startAt = utcFromCay(date, time);
      const endAt = new Date(Date.parse(startAt) + type.durationMin * 60000).toISOString();
      const sendMode = type.mode === "either" ? mode : type.mode;
      const res = await fetch("/api/scheduling/appointments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", clinicianId, kind: "appointment", clientName: name.trim(), clientEmail: email.trim(), typeId, mode: sendMode, startAt, endAt, notifyClient: notify }),
      });
      const d = await res.json();
      if (res.ok) { router.push(`/m?d=${date}`); router.refresh(); }
      else { setErr(d.error || "Couldn't book the appointment."); setBusy(false); }
    } catch { setErr("Couldn't book the appointment."); setBusy(false); }
  }

  return (
    <div className="mflow mbook2">
      <header className="mflow-head">
        <a href="/m" className="mflow-x" aria-label="Close">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </a>
        <div className="mflow-title">New appointment</div>
        <span className="mbook2-stepcount">Step {step + 1} of 3</span>
      </header>

      <div className="mbook2-stepper">
        {STEPS.map((s, i) => (
          <div key={s} className={`mbook2-step${i === step ? " active" : i < step ? " done" : ""}`}>
            <span className="mbook2-bar" />
            <span className="mbook2-step-lb">{s}</span>
          </div>
        ))}
      </div>

      <div className="mflow-body">
        {step === 0 && (
          <>
            <div className="mbook2-h">Who&apos;s it for?</div>
            <div className="mcard">
              <div className="mfield"><label>Client name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" autoFocus /></div>
              <div className="mfield"><label>Client email <span className="mbook2-opt">optional</span></label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" /></div>
            </div>
            <p className="mbook2-note">With an email we send the confirmation and any intake forms automatically.</p>
          </>
        )}

        {step === 1 && (
          <>
            <div className="mbook2-h">Pick a service</div>
            <div className="mbook2-cats">
              {cats.map((cat) => {
                const items = types.filter((t) => t.category === cat);
                const open = openCat === cat;
                return (
                  <div key={cat} className={`mbook2-cat${open ? " open" : ""}`}>
                    <button className="mbook2-cathead" onClick={() => setOpenCat(open ? null : cat)} aria-expanded={open}>
                      <span>{cat}</span>
                      <span className="mbook2-cathead-r">
                        <span className="mbook2-count">{items.length}</span>
                        <span className="mbook2-chev" aria-hidden="true"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg></span>
                      </span>
                    </button>
                    {open && (
                      <div className="mbook2-catlist">
                        {items.map((t) => (
                          <button key={t.id} className="mbook2-type" onClick={() => pickType(t)}>
                            <span className="mbook2-type-main"><b>{t.name}</b><small>{t.durationMin} min · {modeLabel(t.mode)}</small></span>
                            <span className="mbook2-type-go" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg></span>
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

        {step === 2 && type && (
          <>
            <div className="mbook2-h">When?</div>
            <div className="mbook2-summary">
              <span className="mbook2-ini" aria-hidden="true">{initials(name)}</span>
              <span className="mbook2-sum-t"><b>{name || "Client"}</b><small>{type.name} · {type.durationMin} min</small></span>
              <button className="mbook2-change" onClick={() => { setErr(""); setStep(1); }}>Change</button>
            </div>

            {type.mode === "either" && (
              <>
                <label className="mbook2-flabel">Mode</label>
                <div className="mseg">
                  <button className={mode === "in_person" ? "on" : ""} onClick={() => setMode("in_person")}>In person</button>
                  <button className={mode === "virtual" ? "on" : ""} onClick={() => setMode("virtual")}>Online</button>
                </div>
              </>
            )}

            <label className="mbook2-flabel">Day</label>
            <div className="mbook2-days">
              {days.map((d) => {
                const p = dayParts(d);
                return (
                  <button key={d} className={`mbook2-day${date === d ? " on" : ""}`} onClick={() => { setDate(d); setErr(""); }}>
                    <span className="dow">{p.dow}</span>
                    <span className="num">{p.num}</span>
                  </button>
                );
              })}
            </div>

            <label className="mbook2-flabel">Start time</label>
            <div className="mbook2-times">
              {slots.map((t) => (
                <button key={t} className={`mbook2-slot${time === t ? " on" : ""}`} onClick={() => { setTime(t); setErr(""); }}>{label12(t)}</button>
              ))}
            </div>

            <div className="mbook2-toggle-row">
              <span>Email the client their confirmation</span>
              <button type="button" role="switch" aria-checked={notify} aria-label="Email the client their confirmation" className={`mtoggle${notify ? " on" : ""}`} onClick={() => setNotify((v) => !v)}><span /></button>
            </div>
          </>
        )}

        {err && <div className="mmsg err">{err}</div>}
      </div>

      <div className="mflow-foot">
        {step > 0 && <button className="mbtn ghost" onClick={() => { setErr(""); setStep((s) => s - 1); }}>Back</button>}
        {step < 2
          ? <button className="mbtn primary" onClick={next}>Continue</button>
          : <button className="mbtn primary" disabled={busy} onClick={book}>{busy ? "Booking…" : "Book appointment"}</button>}
      </div>
    </div>
  );
}
