"use client";

import { useEffect, useMemo, useState } from "react";

type Mode = "in_person" | "virtual" | "either";
interface Type { id: string; name: string; category: string; durationMin: number; price: number; mode: Mode; color: string; hasIntake: boolean; newClientIntakeOnly: boolean; }
interface Clin { id: string; name: string; credentials: string; }
interface Insurer { id: string; name: string; }
interface Slot { minute: number; clinicianId: string; }
type Step = "service" | "clinician" | "time" | "details" | "confirm" | "done";

const CAY = 5;
const pad = (n: number) => String(n).padStart(2, "0");
const utcFromCay = (dateStr: string, minute: number) => { const [y, m, d] = dateStr.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, CAY + Math.floor(minute / 60), minute % 60)).toISOString(); };
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const initials = (name: string) => name.replace(/\(.*?\)/g, "").split(/\s+/).filter((w) => w && !/^(dr|mrs|mr|ms|miss)\.?$/i.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const MODE_LABEL: Record<Mode, string> = { in_person: "In person", virtual: "Virtual", either: "In person or virtual" };

export default function BookingFlow({ practiceName, types, clinicians, insurers, preview }: {
  practiceName: string; types: Type[]; clinicians: Clin[]; insurers: Insurer[]; preview: string;
}) {
  const tz = useMemo(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "your timezone"; } }, []);
  const [step, setStep] = useState<Step>("service");
  const [type, setType] = useState<Type | null>(null);
  const [clin, setClin] = useState<string>("any"); // "any" or id
  const [date, setDate] = useState<string>("");
  const [slot, setSlot] = useState<Slot | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState({ name: "", email: "", phone: "", path: "self_pay" as "self_pay" | "insurance", insurerId: "", policyNo: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmed, setConfirmed] = useState<{ startAt: string } | null>(null);

  const clinName = (id: string) => clinicians.find((c) => c.id === id)?.name || "";
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  // Next 21 days as selectable chips (local calendar).
  const dayChips = useMemo(() => {
    const out: { date: string; dow: string; d: number; mon: string }[] = [];
    const base = new Date();
    for (let i = 0; i < 21; i++) {
      const dd = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      out.push({ date: `${dd.getFullYear()}-${pad(dd.getMonth() + 1)}-${pad(dd.getDate())}`, dow: dd.toLocaleDateString("en-US", { weekday: "short" }), d: dd.getDate(), mon: dd.toLocaleDateString("en-US", { month: "short" }) });
    }
    return out;
  }, []);

  useEffect(() => {
    if (step !== "time" || !type || !date) return;
    setLoading(true); setSlots([]); setSlot(null);
    const q = new URLSearchParams({ preview, typeId: type.id, clinicianId: clin, date });
    fetch(`/api/book/slots?${q}`).then((r) => r.json()).then((d) => setSlots(d.slots || [])).catch(() => setSlots([])).finally(() => setLoading(false));
  }, [step, type, date, clin, preview]);

  const grouped = useMemo(() => {
    const g: { label: string; items: Slot[] }[] = [{ label: "Morning", items: [] }, { label: "Afternoon", items: [] }, { label: "Evening", items: [] }];
    for (const s of slots) {
      const h = new Date(utcFromCay(date, s.minute)).getHours();
      g[h < 12 ? 0 : h < 17 ? 1 : 2].items.push(s);
    }
    return g.filter((x) => x.items.length);
  }, [slots, date]);

  async function book() {
    if (!type || !slot) return;
    if (!details.name.trim()) { setErr("Please enter your name."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(details.email)) { setErr("Please enter a valid email."); return; }
    setBusy(true); setErr("");
    const res = await fetch("/api/book/create", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preview, typeId: type.id, clinicianId: slot.clinicianId, date, minute: slot.minute, ...details, insurancePath: details.path }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "Could not book. Please try again."); if (res.status === 409) { setStep("time"); } return; }
    setConfirmed({ startAt: data.appointment.startAt }); setStep("done");
  }

  const STEPS: Step[] = ["service", "clinician", "time", "details"];
  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="bk-page">
      <div className="bk-shell">
        <header className="bk-head">
          <div className="bk-brand">{practiceName}</div>
          <div className="bk-title">Book an appointment</div>
        </header>

        {step !== "done" && (
          <div className="bk-steps">
            {STEPS.map((s, i) => (
              <div key={s} className={`bk-dot ${i === stepIndex ? "on" : ""} ${i < stepIndex ? "done" : ""}`}>
                <span>{i + 1}</span><b>{s === "service" ? "Service" : s === "clinician" ? "Clinician" : s === "time" ? "Time" : "Details"}</b>
              </div>
            ))}
          </div>
        )}

        {step !== "service" && step !== "done" && (
          <button className="bk-back" onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)])}>← Back</button>
        )}

        {/* 1. Service */}
        {step === "service" && (
          <section className="bk-sec">
            <h2 className="bk-h2">What would you like to book?</h2>
            {types.length === 0 && <p className="bk-empty">No services are available to book right now.</p>}
            <div className="bk-cards">
              {types.map((t) => (
                <button key={t.id} className="bk-card" onClick={() => { setType(t); setStep("clinician"); }}>
                  <span className="bk-accent" style={{ background: t.color }} />
                  <span className="bk-cardmain">
                    <span className="bk-cardname">{t.name}</span>
                    <span className="bk-cardmeta">{t.durationMin} min · {MODE_LABEL[t.mode]}{t.price > 0 ? ` · ${money(t.price)}` : ""}</span>
                  </span>
                  <span className="bk-chev">→</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 2. Clinician */}
        {step === "clinician" && (
          <section className="bk-sec">
            <h2 className="bk-h2">Who would you like to see?</h2>
            <div className="bk-cards">
              <button className="bk-card" onClick={() => { setClin("any"); setStep("time"); }}>
                <span className="bk-avatar any">✦</span>
                <span className="bk-cardmain"><span className="bk-cardname">Any available</span><span className="bk-cardmeta">First open time with any clinician</span></span>
                <span className="bk-chev">→</span>
              </button>
              {clinicians.map((c) => (
                <button key={c.id} className="bk-card" onClick={() => { setClin(c.id); setStep("time"); }}>
                  <span className="bk-avatar">{initials(c.name)}</span>
                  <span className="bk-cardmain"><span className="bk-cardname">{c.name}</span><span className="bk-cardmeta">{c.credentials.split("·")[0].trim()}</span></span>
                  <span className="bk-chev">→</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 3. Time */}
        {step === "time" && (
          <section className="bk-sec">
            <h2 className="bk-h2">Pick a time</h2>
            <div className="bk-daystrip">
              {dayChips.map((c) => (
                <button key={c.date} className={`bk-day ${date === c.date ? "on" : ""}`} onClick={() => setDate(c.date)}>
                  <span className="bk-dow">{c.dow}</span><span className="bk-dnum">{c.d}</span><span className="bk-dmon">{c.mon}</span>
                </button>
              ))}
            </div>
            {!date && <p className="bk-hint">Choose a day to see open times.</p>}
            {date && loading && <p className="bk-hint">Finding open times…</p>}
            {date && !loading && slots.length === 0 && <p className="bk-empty">No open times on this day. Try another.</p>}
            {date && !loading && grouped.map((g) => (
              <div key={g.label} className="bk-slotgroup">
                <div className="bk-slotlabel">{g.label}</div>
                <div className="bk-slots">
                  {g.items.map((s, i) => {
                    const iso = utcFromCay(date, s.minute);
                    return <button key={i} className={`bk-slot ${slot === s ? "on" : ""}`} onClick={() => { setSlot(s); setStep("details"); }}>{fmtTime(iso)}</button>;
                  })}
                </div>
              </div>
            ))}
            {slots.length > 0 && <p className="bk-tznote">Times shown in <b>{tz}</b>. The clinic runs on Cayman time (EST).</p>}
          </section>
        )}

        {/* 4. Details */}
        {step === "details" && type && slot && (
          <section className="bk-sec">
            <h2 className="bk-h2">Your details</h2>
            <div className="bk-form">
              <label className="bk-f"><span>Full name</span><input value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} autoFocus /></label>
              <label className="bk-f"><span>Email</span><input type="email" value={details.email} onChange={(e) => setDetails({ ...details, email: e.target.value })} placeholder="For your confirmation & reminders" /></label>
              <label className="bk-f"><span>Phone <em>(optional)</em></span><input value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} /></label>
              <div className="bk-f"><span>How will you pay?</span>
                <div className="bk-seg">
                  <button className={details.path === "self_pay" ? "on" : ""} onClick={() => setDetails({ ...details, path: "self_pay" })}>Self-pay</button>
                  <button className={details.path === "insurance" ? "on" : ""} onClick={() => setDetails({ ...details, path: "insurance" })}>Insurance</button>
                </div>
              </div>
              {details.path === "insurance" && (
                <>
                  <label className="bk-f"><span>Insurer</span>
                    <select value={details.insurerId} onChange={(e) => setDetails({ ...details, insurerId: e.target.value })}>
                      <option value="">Choose…</option>{insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </label>
                  <label className="bk-f"><span>Policy / member no.</span><input value={details.policyNo} onChange={(e) => setDetails({ ...details, policyNo: e.target.value })} /></label>
                </>
              )}
              <label className="bk-f"><span>Anything you&apos;d like us to know? <em>(optional)</em></span><textarea rows={2} value={details.notes} onChange={(e) => setDetails({ ...details, notes: e.target.value })} /></label>
            </div>
            {type.hasIntake && <p className="bk-intake">New here? We&apos;ll email you a short intake form to complete before your first visit. It helps your clinician prepare.</p>}
            {err && <p className="bk-err">{err}</p>}
            <button className="bk-cta" onClick={() => { setErr(""); setStep("confirm"); }}>Review booking</button>
          </section>
        )}

        {/* 5. Confirm */}
        {step === "confirm" && type && slot && (
          <section className="bk-sec">
            <h2 className="bk-h2">Confirm your booking</h2>
            <div className="bk-summary">
              <Row k="Service" v={type.name} />
              <Row k="Clinician" v={clin === "any" ? clinName(slot.clinicianId) : clinName(clin)} />
              <Row k="When" v={`${fmtDay(utcFromCay(date, slot.minute))} · ${fmtTime(utcFromCay(date, slot.minute))}`} />
              <Row k="Length" v={`${type.durationMin} min · ${MODE_LABEL[type.mode]}`} />
              <Row k="You" v={`${details.name}${details.email ? " · " + details.email : ""}`} />
              <Row k="Payment" v={details.path === "insurance" ? `Insurance${details.insurerId ? " · " + (insurers.find((i) => i.id === details.insurerId)?.name || "") : ""}` : "Self-pay"} />
              {type.price > 0 && <Row k="Fee" v={money(type.price)} strong />}
            </div>
            <p className="bk-tznote">Time shown in {tz}. Clinic time is Cayman (EST).</p>
            {err && <p className="bk-err">{err}</p>}
            <button className="bk-cta" onClick={book} disabled={busy}>{busy ? "Booking…" : "Confirm booking"}</button>
            <button className="bk-textbtn" onClick={() => setStep("details")}>Edit details</button>
          </section>
        )}

        {/* Done */}
        {step === "done" && confirmed && type && (
          <section className="bk-sec bk-done">
            <div className="bk-check">✓</div>
            <h2 className="bk-h2">You&apos;re booked</h2>
            <p className="bk-donesub">A confirmation is on its way to <b>{details.email}</b>.</p>
            <div className="bk-summary">
              <Row k="Service" v={type.name} />
              <Row k="Clinician" v={clinName(slot!.clinicianId)} />
              <Row k="When" v={`${fmtDay(confirmed.startAt)} · ${fmtTime(confirmed.startAt)}`} />
            </div>
            {type.hasIntake && <p className="bk-intake">Look out for a short intake form by email. Completing it before your visit helps us give you the best care.</p>}
            <button className="bk-textbtn" onClick={() => { setStep("service"); setType(null); setClin("any"); setDate(""); setSlot(null); setConfirmed(null); setDetails({ name: "", email: "", phone: "", path: "self_pay", insurerId: "", policyNo: "", notes: "" }); }}>Book another</button>
          </section>
        )}

        <footer className="bk-foot">{practiceName} · Cayman Islands</footer>
      </div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <div className={`bk-row ${strong ? "strong" : ""}`}><span>{k}</span><span>{v}</span></div>;
}
