"use client";

import { useRef, useState } from "react";
import type { ClinicianAvailability, DayHours, TimeBlock, DateOverride } from "@/lib/scheduling";
import "./mobile-hours.css";
import MobileBack from "./MobileBack";

interface Clin { id: string; name: string; }

// Weekly day indices match lib/scheduling DayHours (0=Sun .. 6=Sat); render Mon..Sun.
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Steppers: 30-min steps, earliest 6am, latest 10pm, at least 60 min apart.
const MIN_MIN = 6 * 60;
const MAX_MIN = 22 * 60;
const STEP = 30;
const GAP = 60;

// "HH:MM" wall-clock (Cayman) to and from minutes-since-midnight.
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const label12 = (min: number) => {
  let h = Math.floor(min / 60); const m = min % 60; const ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, "0")}${ap}` : `${h}${ap}`;
};
// Date-only string to a friendly label, parsed in UTC so it never drifts a day.
function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${WD[dt.getUTCDay()]} ${d} ${MO[m - 1]}`;
}

const firstBlock = (weekly: DayHours[], day: number): TimeBlock | null => weekly.find((w) => w.day === day)?.blocks[0] ?? null;

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split("|").map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

export default function MobileHours({ clinicians, selectedId, initial }: {
  clinicians: Clin[]; selectedId: string; initial: ClinicianAvailability;
}) {
  const [who, setWho] = useState(selectedId);
  const [av, setAv] = useState<ClinicianAvailability>(initial);
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");
  const dateRef = useRef<HTMLInputElement>(null);

  function change(next: Partial<ClinicianAvailability>) { setAv((a) => ({ ...a, ...next })); setDirty(true); setErr(""); }

  async function switchClin(id: string) {
    setWho(id); setErr(""); setOpenDay(null);
    try {
      const res = await fetch(`/api/scheduling/availability?clinicianId=${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setAv(data.availability); setDirty(false); }
      else setErr(data.error || "Could not load this clinician.");
    } catch { setErr("Could not load this clinician."); }
  }

  // Each weekday maps to a single working block [{start,end}] (other blocks are
  // dropped on edit); set null to mark the day off.
  function setDay(day: number, block: TimeBlock | null) {
    const weekly = av.weekly.filter((w) => w.day !== day);
    if (block) weekly.push({ day, blocks: [block] });
    change({ weekly });
  }
  function toggleDay(day: number) {
    const on = !!firstBlock(av.weekly, day);
    if (on) { setDay(day, null); if (openDay === day) setOpenDay(null); }
    else { setDay(day, { start: "09:00", end: "17:00" }); setOpenDay(day); }
  }
  function nudge(day: number, which: "start" | "end", delta: number) {
    const b = firstBlock(av.weekly, day); if (!b) return;
    let s = toMin(b.start), e = toMin(b.end);
    if (which === "start") s = Math.min(Math.max(MIN_MIN, s + delta), e - GAP);
    else e = Math.max(Math.min(MAX_MIN, e + delta), s + GAP);
    setDay(day, { start: toHHMM(s), end: toHHMM(e) });
  }

  // Date overrides: days off (closed). Existing custom-hours overrides from the
  // web editor are shown and preserved on save, just not edited here.
  const removeOverride = (i: number) => change({ overrides: av.overrides.filter((_, j) => j !== i) });
  function openAddDay() {
    const el = dateRef.current; if (!el) return;
    el.value = "";
    const withPicker = el as HTMLInputElement & { showPicker?: () => void };
    if (typeof withPicker.showPicker === "function") { try { withPicker.showPicker(); return; } catch { /* fall through */ } }
    el.click();
  }
  function onDatePicked(value: string) {
    if (!value) return;
    if (av.overrides.some((o) => o.date === value)) return;
    const next: DateOverride = { date: value, closed: true, blocks: [] };
    change({ overrides: [...av.overrides, next].sort((a, b) => a.date.localeCompare(b.date)) });
  }

  async function save() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/scheduling/availability", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...av, clinicianId: who }),
      });
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      if (res.ok) {
        setAv(data.availability); setDirty(false);
        setToast("Hours saved. Booking page updated");
        setTimeout(() => setToast(""), 2200);
      } else setErr(data.error || "Could not save your hours.");
    } catch { setBusy(false); setErr("Could not save your hours."); }
  }

  const rule = <K extends keyof ClinicianAvailability>(key: K, opts: [number, string][]) => (
    <div className="mseg">
      {opts.map(([v, l]) => (
        <button key={v} type="button" className={av[key] === v ? "on" : ""} onClick={() => change({ [key]: v } as Partial<ClinicianAvailability>)}>{l}</button>
      ))}
    </div>
  );

  return (
    <div className="mflow mhrs">
      <header className="mflow-head mhrs-head">
        <MobileBack className="mflow-x" ariaLabel="Back to calendar"><Icon d="M15 18l-6-6 6-6" size={21} /></MobileBack>
        <div className="mhrs-heading">
          <div className="mflow-title">Hours &amp; availability</div>
          <p className="mhrs-sub">Clients can only book inside these times.</p>
        </div>
      </header>

      <div className="mflow-body">
        {err && <p className="mmsg err">{err}</p>}

        {clinicians.length > 1 && (
          <div className="mcard">
            <label className="mhrs-pick">
              <span className="meyebrow">Clinician</span>
              <select value={who} onChange={(e) => switchClin(e.target.value)}>
                {clinicians.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>
        )}

        <span className="meyebrow mhrs-eye mt">Weekly hours</span>
        <div className="mcard mhrs-week">
          {ORDER.map((day) => {
            const b = firstBlock(av.weekly, day);
            const on = !!b;
            const open = on && openDay === day;
            const s = b ? toMin(b.start) : 0;
            const e = b ? toMin(b.end) : 0;
            return (
              <div key={day} className="mhrs-day">
                <div className="mhrs-dayhead">
                  <button type="button" className="mhrs-dayrow" disabled={!on} onClick={() => setOpenDay(open ? null : day)}>
                    <span className="mhrs-dname">{DAY_NAMES[day]}</span>
                    <span className={`mhrs-drange${on ? "" : " off"}`}>{on ? `${label12(s)} to ${label12(e)}` : "Not working"}</span>
                  </button>
                  <button type="button" className={`mtoggle${on ? " on" : ""}`} onClick={() => toggleDay(day)} aria-label={`${DAY_NAMES[day]} ${on ? "on" : "off"}`}><span /></button>
                </div>
                {open && (
                  <div className="mhrs-steppers">
                    <div className="mhrs-step">
                      <div className="mhrs-step-lbl">Start</div>
                      <div className="mhrs-step-ctl">
                        <button type="button" className="mhrs-rnd" aria-label="Earlier start" disabled={s <= MIN_MIN} onClick={() => nudge(day, "start", -STEP)}><Icon d="M5 12h14" size={15} /></button>
                        <b className="mhrs-step-val">{label12(s)}</b>
                        <button type="button" className="mhrs-rnd" aria-label="Later start" disabled={s >= e - GAP} onClick={() => nudge(day, "start", STEP)}><Icon d="M12 5v14|M5 12h14" size={15} /></button>
                      </div>
                    </div>
                    <div className="mhrs-step">
                      <div className="mhrs-step-lbl">End</div>
                      <div className="mhrs-step-ctl">
                        <button type="button" className="mhrs-rnd" aria-label="Earlier end" disabled={e <= s + GAP} onClick={() => nudge(day, "end", -STEP)}><Icon d="M5 12h14" size={15} /></button>
                        <b className="mhrs-step-val">{label12(e)}</b>
                        <button type="button" className="mhrs-rnd" aria-label="Later end" disabled={e >= MAX_MIN} onClick={() => nudge(day, "end", STEP)}><Icon d="M12 5v14|M5 12h14" size={15} /></button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <span className="meyebrow mhrs-eye mt">Booking rules</span>
        <div className="mcard">
          <div className="mhrs-rules">
            <div>
              <span className="mhrs-rule-lbl">Minimum notice</span>
              {rule("minNoticeHours", [[2, "2h"], [12, "12h"], [24, "1 day"], [48, "2 days"]])}
            </div>
            <div>
              <span className="mhrs-rule-lbl">Book up to</span>
              {rule("bookAheadDays", [[30, "30 days"], [60, "60 days"], [90, "90 days"]])}
            </div>
            <div>
              <span className="mhrs-rule-lbl">Start times every</span>
              {rule("slotIntervalMin", [[15, "15 min"], [30, "30 min"], [60, "1 hour"]])}
            </div>
          </div>
        </div>

        <span className="meyebrow mhrs-eye mt">Date overrides</span>
        <div className="mhrs-ovs">
          {av.overrides.map((o, i) => (
            <div key={`${o.date}-${i}`} className="mhrs-ov">
              <span className="mhrs-ov-ic"><Icon d="M8 3v3|M16 3v3|M3.5 8.5h17|M6 18.5 18 6.5|M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2" size={17} /></span>
              <span className="mhrs-ov-txt"><b>{fmtDate(o.date)}</b> · {o.closed ? "Off, all day" : `${label12(toMin(o.blocks[0]?.start ?? "09:00"))} to ${label12(toMin(o.blocks[0]?.end ?? "13:00"))}`}</span>
              <button type="button" className="mhrs-ov-x" aria-label={`Remove ${fmtDate(o.date)}`} onClick={() => removeOverride(i)}><Icon d="M18 6 6 18|M6 6l12 12" size={15} /></button>
            </div>
          ))}
          <button type="button" className="mhrs-add" onClick={openAddDay}><Icon d="M12 5v14|M5 12h14" size={15} />Add a day off</button>
          <input ref={dateRef} type="date" className="mhrs-datein" aria-hidden="true" tabIndex={-1} onChange={(e) => onDatePicked(e.target.value)} />
        </div>
      </div>

      <div className="mflow-foot">
        <button type="button" className="mbtn primary" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : dirty ? "Save hours" : "Saved"}</button>
      </div>

      {toast && <div className="mtoast">{toast}</div>}
    </div>
  );
}
