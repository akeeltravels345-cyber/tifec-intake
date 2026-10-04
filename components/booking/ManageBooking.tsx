"use client";

import { useEffect, useMemo, useState } from "react";

interface Summary { id: string; service: string; typeId: string | null; durationMin: number; clinicianId: string; clinicianName: string; clientName: string; clientEmail: string; phone: string; startAt: string; endAt: string; mode: string; status: string; }
interface Slot { minute: number; clinicianId: string; }

const CAY = 5;
const pad = (n: number) => String(n).padStart(2, "0");
const utcFromCay = (dateStr: string, minute: number) => { const [y, m, d] = dateStr.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, CAY + Math.floor(minute / 60), minute % 60)).toISOString(); };

export default function ManageBooking({ initial, preview, practiceName }: { initial: Summary; preview: string; practiceName: string }) {
  const tz = useMemo(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "your timezone"; } }, []);
  const [appt, setAppt] = useState<Summary>(initial);
  const [mode, setMode] = useState<"view" | "reschedule" | "edit" | "done" | "cancelled">(initial.status === "cancelled" ? "cancelled" : "view");
  const [form, setForm] = useState({ name: initial.clientName, email: initial.clientEmail, phone: initial.phone });
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const fmtWhen = (iso: string) => `${new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} · ${new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const dayChips = useMemo(() => {
    const out: { date: string; dow: string; d: number; mon: string }[] = [];
    const base = new Date();
    for (let i = 0; i < 21; i++) { const dd = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i); out.push({ date: `${dd.getFullYear()}-${pad(dd.getMonth() + 1)}-${pad(dd.getDate())}`, dow: dd.toLocaleDateString("en-US", { weekday: "short" }), d: dd.getDate(), mon: dd.toLocaleDateString("en-US", { month: "short" }) }); }
    return out;
  }, []);

  useEffect(() => {
    if (mode !== "reschedule" || !date || !appt.typeId) return;
    setLoading(true); setSlots([]);
    fetch(`/api/book/slots?${new URLSearchParams({ preview, typeId: appt.typeId, clinicianId: appt.clinicianId, date })}`)
      .then((r) => r.json()).then((d) => setSlots(d.slots || [])).catch(() => setSlots([])).finally(() => setLoading(false));
  }, [mode, date, appt.typeId, appt.clinicianId, preview]);

  const grouped = useMemo(() => {
    const g: { label: string; items: Slot[] }[] = [{ label: "Morning", items: [] }, { label: "Afternoon", items: [] }, { label: "Evening", items: [] }];
    for (const s of slots) { const h = new Date(utcFromCay(date, s.minute)).getHours(); g[h < 12 ? 0 : h < 17 ? 1 : 2].items.push(s); }
    return g.filter((x) => x.items.length);
  }, [slots, date]);

  async function pick(s: Slot) {
    setBusy(true); setErr("");
    const res = await fetch("/api/book/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preview, id: appt.id, action: "reschedule", date, minute: s.minute }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "Could not reschedule."); return; }
    setAppt(data.appointment); setMode("done");
  }
  async function saveEdit() {
    setBusy(true); setErr("");
    const res = await fetch("/api/book/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preview, id: appt.id, action: "edit", clientName: form.name, clientEmail: form.email, phone: form.phone }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "Could not save your changes."); return; }
    setAppt(data.appointment); setMode("view");
  }
  async function cancel() {
    if (!confirm("Cancel this booking?")) return;
    setBusy(true); setErr("");
    const res = await fetch("/api/book/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preview, id: appt.id, action: "cancel" }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "Could not cancel."); return; }
    setMode("cancelled");
  }

  return (
    <div className="bk-page">
      <div className="bk-shell">
        <header className="bk-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="bk-logo" src="/tifec-mark.png" alt="" />
          <div className="bk-brand">{practiceName}</div><div className="bk-title">Manage your booking</div>
        </header>

        {mode === "cancelled" && (
          <section className="bk-sec bk-done">
            <div className="bk-check" style={{ background: "linear-gradient(135deg,#8a929a,#6b7679)" }}>–</div>
            <h2 className="bk-h2">Booking cancelled</h2>
            <p className="bk-donesub">Your appointment has been cancelled. You&apos;re welcome to book again any time.</p>
          </section>
        )}

        {mode === "view" && (
          <section className="bk-sec">
            <h2 className="bk-h2">Your appointment</h2>
            <div className="bk-summary">
              <div className="bk-row"><span>Service</span><span>{appt.service}</span></div>
              <div className="bk-row"><span>Clinician</span><span>{appt.clinicianName}</span></div>
              <div className="bk-row"><span>When</span><span>{fmtWhen(appt.startAt)}</span></div>
              <div className="bk-row"><span>Name</span><span>{appt.clientName}</span></div>
              {appt.clientEmail && <div className="bk-row"><span>Email</span><span>{appt.clientEmail}</span></div>}
            </div>
            <p className="bk-tznote">Time shown in {tz}. Clinic time is Cayman (EST).</p>
            {err && <p className="bk-err">{err}</p>}
            <button className="bk-cta" onClick={() => { setMode("reschedule"); setErr(""); }}>Reschedule</button>
            <button className="bk-textbtn" onClick={() => { setForm({ name: appt.clientName, email: appt.clientEmail, phone: appt.phone }); setMode("edit"); setErr(""); }}>Edit your details</button>
            <button className="bk-textbtn" style={{ color: "#b1543c" }} onClick={cancel} disabled={busy}>Cancel booking</button>
          </section>
        )}

        {mode === "edit" && (
          <section className="bk-sec">
            <button className="bk-back" onClick={() => { setMode("view"); setErr(""); }}>← Back</button>
            <h2 className="bk-h2">Edit your details</h2>
            <p className="bk-donesub" style={{ marginBottom: 16 }}>Fix a spelling, or update your email or phone. This won&apos;t change your appointment time.</p>
            <label className="bk-f"><span>Full name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" /></label>
            <label className="bk-f"><span>Email</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="How we'll reach you" /></label>
            <label className="bk-f"><span>Phone <em>(optional)</em></span><input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            {err && <p className="bk-err">{err}</p>}
            <button className="bk-cta" onClick={saveEdit} disabled={busy || !form.name.trim()}>{busy ? "Saving…" : "Save changes"}</button>
          </section>
        )}

        {mode === "reschedule" && (
          <section className="bk-sec">
            <button className="bk-back" onClick={() => setMode("view")}>← Back</button>
            <h2 className="bk-h2">Pick a new time</h2>
            <div className="bk-daystrip">
              {dayChips.map((c) => <button key={c.date} className={`bk-day ${date === c.date ? "on" : ""}`} onClick={() => setDate(c.date)}><span className="bk-dow">{c.dow}</span><span className="bk-dnum">{c.d}</span><span className="bk-dmon">{c.mon}</span></button>)}
            </div>
            {!date && <p className="bk-hint">Choose a day to see open times.</p>}
            {date && loading && <p className="bk-hint">Finding open times…</p>}
            {date && !loading && slots.length === 0 && <p className="bk-empty">No open times on this day. Try another.</p>}
            {date && !loading && grouped.map((g) => (
              <div key={g.label} className="bk-slotgroup"><div className="bk-slotlabel">{g.label}</div>
                <div className="bk-slots">{g.items.map((s, i) => <button key={i} className="bk-slot" disabled={busy} onClick={() => pick(s)}>{fmtTime(utcFromCay(date, s.minute))}</button>)}</div>
              </div>
            ))}
            {err && <p className="bk-err">{err}</p>}
          </section>
        )}

        {mode === "done" && (
          <section className="bk-sec bk-done">
            <div className="bk-check">✓</div>
            <h2 className="bk-h2">Booking updated</h2>
            <p className="bk-donesub">Your new time is confirmed. A fresh confirmation is on its way to your email.</p>
            <div className="bk-summary">
              <div className="bk-row"><span>Service</span><span>{appt.service}</span></div>
              <div className="bk-row"><span>Clinician</span><span>{appt.clinicianName}</span></div>
              <div className="bk-row"><span>When</span><span>{fmtWhen(appt.startAt)}</span></div>
            </div>
          </section>
        )}

        <footer className="bk-foot">{practiceName} · Cayman Islands</footer>
      </div>
    </div>
  );
}
