"use client";

import { useState } from "react";
import type { ClinicianAvailability, DayHours, TimeBlock, DateOverride } from "@/lib/scheduling";

interface Clin { id: string; name: string; }
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Show the week Monday-first, the way a clinic reads it.
const ORDER = [1, 2, 3, 4, 5, 6, 0];

const blocksFor = (weekly: DayHours[], day: number): TimeBlock[] => weekly.find((d) => d.day === day)?.blocks ?? [];

export default function AvailabilityManager({ clinicians, selectedId, initial }: {
  clinicians: Clin[]; selectedId: string; initial: ClinicianAvailability;
}) {
  const [who, setWho] = useState(selectedId);
  const [av, setAv] = useState<ClinicianAvailability>(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function change(next: Partial<ClinicianAvailability>) { setAv((a) => ({ ...a, ...next })); setDirty(true); setMsg(""); }

  async function switchClin(id: string) {
    setWho(id); setMsg("");
    const res = await fetch(`/api/scheduling/availability?clinicianId=${encodeURIComponent(id)}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setAv(data.availability); setDirty(false); }
    else setMsg(data.error || "Could not load.");
  }

  function setDayBlocks(day: number, blocks: TimeBlock[]) {
    const weekly = av.weekly.filter((d) => d.day !== day);
    if (blocks.length) weekly.push({ day, blocks });
    change({ weekly });
  }
  const addBlock = (day: number) => setDayBlocks(day, [...blocksFor(av.weekly, day), { start: "09:00", end: "17:00" }]);
  const editBlock = (day: number, i: number, k: keyof TimeBlock, v: string) => {
    const blocks = blocksFor(av.weekly, day).map((b, j) => (j === i ? { ...b, [k]: v } : b));
    setDayBlocks(day, blocks);
  };
  const removeBlock = (day: number, i: number) => setDayBlocks(day, blocksFor(av.weekly, day).filter((_, j) => j !== i));
  function copyMondayToWeekdays() {
    const mon = blocksFor(av.weekly, 1);
    const weekly = av.weekly.filter((d) => ![2, 3, 4, 5].includes(d.day));
    for (const day of [2, 3, 4, 5]) if (mon.length) weekly.push({ day, blocks: mon.map((b) => ({ ...b })) });
    change({ weekly });
  }

  // Date overrides
  const addOverride = () => {
    const today = new Date().toISOString().slice(0, 10);
    change({ overrides: [...av.overrides, { date: today, closed: true, blocks: [] }] });
  };
  const editOverride = (i: number, patch: Partial<DateOverride>) =>
    change({ overrides: av.overrides.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  const removeOverride = (i: number) => change({ overrides: av.overrides.filter((_, j) => j !== i) });

  async function save() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/scheduling/availability", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...av, clinicianId: who }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { setAv(data.availability); setDirty(false); setMsg("Saved."); }
    else setMsg(data.error || "Could not save.");
  }

  return (
    <div className="av">
      <div className="av-head">
        <div>
          <h1 className="av-h1">Availability</h1>
          <p className="av-sub">When each clinician can be booked. Times are Cayman time; clients see their own on the booking page.</p>
        </div>
        <label className="av-pick"><span>Clinician</span>
          <select value={who} onChange={(e) => switchClin(e.target.value)}>
            {clinicians.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>

      <div className="av-card">
        <div className="av-cardhead"><h2>Weekly hours</h2><button className="av-link" onClick={copyMondayToWeekdays}>Copy Monday to Tue–Fri</button></div>
        {ORDER.map((day) => {
          const blocks = blocksFor(av.weekly, day);
          return (
            <div key={day} className="av-day">
              <div className="av-dname">{DAYS[day]}</div>
              <div className="av-blocks">
                {blocks.length === 0 && <span className="av-closed">Closed</span>}
                {blocks.map((b, i) => (
                  <span key={i} className="av-block">
                    <input type="time" value={b.start} onChange={(e) => editBlock(day, i, "start", e.target.value)} />
                    <span className="av-to">to</span>
                    <input type="time" value={b.end} onChange={(e) => editBlock(day, i, "end", e.target.value)} />
                    <button className="av-x" onClick={() => removeBlock(day, i)} aria-label="Remove">×</button>
                  </span>
                ))}
                <button className="av-addblock" onClick={() => addBlock(day)}>+ Add hours</button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="av-card">
        <div className="av-cardhead"><h2>Booking rules</h2></div>
        <div className="av-rules">
          <label className="av-rule"><span>Minimum notice (hours)</span>
            <input type="number" min={0} value={av.minNoticeHours} onChange={(e) => change({ minNoticeHours: Number(e.target.value) })} /></label>
          <label className="av-rule"><span>Book up to (days ahead)</span>
            <input type="number" min={1} value={av.bookAheadDays} onChange={(e) => change({ bookAheadDays: Number(e.target.value) })} /></label>
          <label className="av-rule"><span>Max per day (0 = no limit)</span>
            <input type="number" min={0} value={av.maxPerDay} onChange={(e) => change({ maxPerDay: Number(e.target.value) })} /></label>
          <label className="av-rule"><span>Slot interval (min)</span>
            <input type="number" min={5} step={5} value={av.slotIntervalMin} onChange={(e) => change({ slotIntervalMin: Number(e.target.value) })} /></label>
        </div>
      </div>

      <div className="av-card">
        <div className="av-cardhead"><h2>Days off &amp; one-off changes</h2><button className="av-link" onClick={addOverride}>+ Add a date</button></div>
        {av.overrides.length === 0 && <p className="av-empty">No overrides. Add a date to close it or set special hours.</p>}
        {av.overrides.map((o, i) => (
          <div key={i} className="av-ov">
            <input type="date" value={o.date} onChange={(e) => editOverride(i, { date: e.target.value })} />
            <div className="av-seg2">
              <button className={o.closed ? "on" : ""} onClick={() => editOverride(i, { closed: true, blocks: [] })}>Closed</button>
              <button className={!o.closed ? "on" : ""} onClick={() => editOverride(i, { closed: false, blocks: o.blocks.length ? o.blocks : [{ start: "09:00", end: "13:00" }] })}>Custom hours</button>
            </div>
            {!o.closed && (
              <span className="av-block">
                <input type="time" value={o.blocks[0]?.start ?? "09:00"} onChange={(e) => editOverride(i, { blocks: [{ start: e.target.value, end: o.blocks[0]?.end ?? "13:00" }] })} />
                <span className="av-to">to</span>
                <input type="time" value={o.blocks[0]?.end ?? "13:00"} onChange={(e) => editOverride(i, { blocks: [{ start: o.blocks[0]?.start ?? "09:00", end: e.target.value }] })} />
              </span>
            )}
            <button className="av-x" onClick={() => removeOverride(i)} aria-label="Remove date">×</button>
          </div>
        ))}
      </div>

      <div className="av-save">
        {msg && <span className={`av-msg ${msg === "Saved." ? "ok" : "err"}`}>{msg}</span>}
        <span className="av-sp" />
        <button className="av-btn primary" onClick={save} disabled={busy || !dirty}>{busy ? "Saving…" : dirty ? "Save changes" : "Saved"}</button>
      </div>
    </div>
  );
}
