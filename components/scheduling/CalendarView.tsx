"use client";

import { useEffect, useState } from "react";
import type { Appointment, AppointmentType, AppointmentMode, AppointmentStatus, DayHours, DateOverride } from "@/lib/scheduling";

interface Clin { id: string; name: string; }
interface Insurer { id: string; name: string; }
interface Avail { clinicianId: string; weekly: DayHours[]; overrides: DateOverride[]; }

const CAY = 5; // Cayman is UTC-5 year-round (no DST)
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_START = 7, DAY_END = 20, HOUR = 46; // 7am-8pm, 46px/hour
const MODE_LABEL: Record<AppointmentMode, string> = { in_person: "In person", virtual: "Virtual", either: "Either" };
const STATUS: { key: AppointmentStatus; label: string }[] = [
  { key: "booked", label: "Booked" }, { key: "confirmed", label: "Confirmed" },
  { key: "seen", label: "Seen" }, { key: "no_show", label: "No-show" }, { key: "cancelled", label: "Cancelled" },
];

// ---- date helpers (Cayman = fixed UTC-5) ----
const pad = (n: number) => String(n).padStart(2, "0");
const partsOf = (dateStr: string) => dateStr.split("-").map((x) => parseInt(x, 10));
const addDays = (dateStr: string, n: number) => { const [y, m, d] = partsOf(dateStr); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const weekdayMon = (dateStr: string) => { const [y, m, d] = partsOf(dateStr); return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; }; // 0=Mon
const mondayOf = (dateStr: string) => addDays(dateStr, -weekdayMon(dateStr));
const cayFromUtc = (iso: string) => new Date(Date.parse(iso) - CAY * 3600e3); // read UTC parts = Cayman wall
const cayDay = (iso: string) => cayFromUtc(iso).toISOString().slice(0, 10);
const cayMinutes = (iso: string) => { const d = cayFromUtc(iso); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const utcFromCay = (dateStr: string, minutes: number) => { const [y, m, d] = partsOf(dateStr); return new Date(Date.UTC(y, m - 1, d, CAY + Math.floor(minutes / 60), minutes % 60)).toISOString(); };
const hhmm = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const label12 = (minutes: number) => { let h = Math.floor(minutes / 60); const m = minutes % 60; const ap = h < 12 ? "am" : "pm"; h = h % 12 || 12; return `${h}${m ? ":" + pad(m) : ""}${ap}`; };
const prettyDate = (dateStr: string) => { const [y, m, d] = partsOf(dateStr); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }); };

type Draft = Partial<Appointment> & { _date?: string; _startMin?: number; _durMin?: number; _repeatEvery?: number; _repeatCount?: number };

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

export default function CalendarView({ clinicians, types, insurers, availabilities, todayCayman, initial }: {
  clinicians: Clin[]; types: AppointmentType[]; insurers: Insurer[]; availabilities: Avail[]; todayCayman: string; initial: Appointment[];
}) {
  const availMap = new Map(availabilities.map((a) => [a.clinicianId, a]));
  // Working intervals (minutes) for a clinician on a date; null = we don't know.
  function workingBlocks(clinId: string, dayStr: string): { s: number; e: number }[] | null {
    const av = availMap.get(clinId);
    if (!av) return null;
    const ov = av.overrides.find((o) => o.date === dayStr);
    if (ov) return ov.closed ? [] : ov.blocks.map((b) => ({ s: toMin(b.start), e: toMin(b.end) }));
    const [y, m, d] = dayStr.split("-").map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat, matches stored weekly.day
    const dh = av.weekly.find((x) => x.day === wd);
    return dh ? dh.blocks.map((b) => ({ s: toMin(b.start), e: toMin(b.end) })) : [];
  }
  function closedRegions(clinId: string, dayStr: string): { s: number; e: number }[] {
    const blocks = workingBlocks(clinId, dayStr);
    if (blocks === null) return [];
    const lo = DAY_START * 60, hi = DAY_END * 60;
    const sorted = blocks.filter((b) => b.e > lo && b.s < hi).map((b) => ({ s: Math.max(lo, b.s), e: Math.min(hi, b.e) })).sort((a, b) => a.s - b.s);
    const regions: { s: number; e: number }[] = []; let cur = lo;
    for (const b of sorted) { if (b.s > cur) regions.push({ s: cur, e: b.s }); cur = Math.max(cur, b.e); }
    if (cur < hi) regions.push({ s: cur, e: hi });
    return regions;
  }
  const [monday, setMonday] = useState(() => mondayOf(todayCayman));
  const [appts, setAppts] = useState<Appointment[]>(initial);
  const [who, setWho] = useState<string>("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [attName, setAttName] = useState("");
  const [attEmail, setAttEmail] = useState("");
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  async function load(mon: string, clin: string) {
    const from = utcFromCay(mon, 0), to = utcFromCay(addDays(mon, 7), 0);
    const q = new URLSearchParams({ from, to });
    if (clin !== "all") q.set("clinicianId", clin);
    const res = await fetch(`/api/scheduling/appointments?${q}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setAppts(data.appointments || []);
  }
  useEffect(() => { load(monday, who); /* eslint-disable-next-line */ }, [monday, who]);

  const typeById = (id: string | null) => types.find((t) => t.id === id) || null;
  const clinName = (id: string) => clinicians.find((c) => c.id === id)?.name || id;

  // ---- new / edit ----
  function openNew(date?: string, startMin?: number) {
    const t = types[0];
    setErr("");
    setDraft({
      kind: "appointment", clientName: "", clientEmail: "", clinicianId: who !== "all" ? who : (clinicians[0]?.id || ""),
      typeId: t?.id || null, mode: t?.mode || "in_person", locationOrLink: "", status: "booked",
      insurancePath: "self_pay", insurerId: null, policyNo: "", notes: "",
      capacity: t?.capacity || 1, attendees: [],
      _date: date || days[0], _startMin: startMin ?? 9 * 60, _durMin: t?.durationMin || 50,
      _repeatEvery: 0, _repeatCount: 4,
    });
  }
  function openEdit(a: Appointment) {
    setErr("");
    setDraft({ ...a, _date: cayDay(a.startAt), _startMin: cayMinutes(a.startAt), _durMin: Math.round((Date.parse(a.endAt) - Date.parse(a.startAt)) / 60000) });
  }
  function pickType(id: string) {
    const t = typeById(id);
    setDraft((d) => d ? { ...d, typeId: id, mode: t?.mode || d.mode, _durMin: t?.durationMin || d._durMin, capacity: t?.capacity || 1 } : d);
  }

  const isGroup = (d: Draft | null) => !!d && d.kind !== "block" && (d.capacity || 1) > 1;
  async function save() {
    if (!draft) return;
    // A group session is labelled by its type; individuals need a client name.
    if (isGroup(draft) && !String(draft.clientName || "").trim()) draft.clientName = typeById(draft.typeId || "")?.name || "Group session";
    if (draft.kind !== "block" && !isGroup(draft) && !String(draft.clientName || "").trim()) { setErr("Who is it for?"); return; }
    if (!draft.clinicianId) { setErr("Pick a clinician."); return; }
    const startAt = utcFromCay(draft._date!, draft._startMin!);
    const endAt = utcFromCay(draft._date!, draft._startMin! + (draft._durMin || 50));
    setBusy(true);
    const payload: Record<string, unknown> = { ...draft, startAt, endAt };
    if (!draft.id && draft._repeatEvery) { payload.repeatEveryDays = draft._repeatEvery; payload.repeatCount = draft._repeatCount || 1; }
    delete payload._date; delete payload._startMin; delete payload._durMin; delete payload._repeatEvery; delete payload._repeatCount;
    const action = draft.id ? "update" : "create";
    const res = await fetch("/api/scheduling/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "Could not save."); return; }
    setDraft(null); load(monday, who);
  }
  async function setStatus(a: Appointment, status: AppointmentStatus) {
    const res = await fetch("/api/scheduling/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", id: a.id, status }) });
    const data = await res.json().catch(() => ({}));
    load(monday, who);
    setDraft((d) => (d && d.id === a.id ? { ...d, status, billingSessionId: data.appointment?.billingSessionId ?? d.billingSessionId } : d));
  }
  async function remove(a: Appointment) {
    if (!confirm("Delete this from the calendar?")) return;
    await fetch("/api/scheduling/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id: a.id }) });
    setDraft(null); load(monday, who);
  }
  async function removeSeries(a: Appointment) {
    if (!a.seriesId) return;
    if (!confirm("Remove this and all later appointments in the series?")) return;
    await fetch("/api/scheduling/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "series:removeFrom", seriesId: a.seriesId, fromStartAt: a.startAt }) });
    setDraft(null); load(monday, who);
  }
  // Drag to reschedule: keep the length, move to the dropped day + start time.
  async function reschedule(id: string, day: string, startMin: number) {
    const a = appts.find((x) => x.id === id);
    if (!a) return;
    const dur = Math.round((Date.parse(a.endAt) - Date.parse(a.startAt)) / 60000);
    const clamped = Math.max(DAY_START * 60, Math.min(startMin, DAY_END * 60 - dur));
    const startAt = utcFromCay(day, clamped), endAt = utcFromCay(day, clamped + dur);
    setAppts((list) => list.map((x) => (x.id === id ? { ...x, startAt, endAt } : x))); // optimistic
    await fetch("/api/scheduling/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", id, startAt, endAt }) });
    load(monday, who);
  }
  function onDrop(e: React.DragEvent, day: string) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const min = DAY_START * 60 + Math.round(((e.clientY - rect.top) / HOUR) * 60 / 15) * 15;
    reschedule(id, day, min);
  }

  // ---- lane layout per day (side-by-side for overlaps) ----
  function layout(dayAppts: Appointment[]) {
    const items = dayAppts.map((a) => ({ a, s: cayMinutes(a.startAt), e: cayMinutes(a.startAt) + Math.round((Date.parse(a.endAt) - Date.parse(a.startAt)) / 60000) })).sort((x, y) => x.s - y.s);
    const lanes: number[] = []; // lane -> end minute
    const placed = items.map((it) => {
      let lane = lanes.findIndex((end) => end <= it.s);
      if (lane === -1) { lane = lanes.length; lanes.push(it.e); } else lanes[lane] = it.e;
      return { ...it, lane };
    });
    const laneCount = Math.max(1, lanes.length);
    return placed.map((p) => ({ ...p, laneCount }));
  }

  const weekLabel = `${prettyDate(monday)} – ${prettyDate(addDays(monday, 6))}`;

  return (
    <div className="cal">
      <div className="cal-bar">
        <div className="cal-nav">
          <button onClick={() => setMonday(addDays(monday, -7))} aria-label="Previous week">‹</button>
          <button className="today" onClick={() => setMonday(mondayOf(todayCayman))}>Today</button>
          <button onClick={() => setMonday(addDays(monday, 7))} aria-label="Next week">›</button>
        </div>
        <div className="cal-week">{weekLabel}</div>
        <span className="cal-sp" />
        <select className="cal-who" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="all">All clinicians</option>
          {clinicians.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="cal-new" onClick={() => openNew()}>+ New</button>
      </div>

      <div className="cal-gridwrap">
        <div className="cal-grid" style={{ height: (DAY_END - DAY_START) * HOUR + 30 }}>
          <div className="cal-gutter">
            <div className="cal-colhead" />
            {Array.from({ length: DAY_END - DAY_START }, (_, i) => (
              <div key={i} className="cal-hour" style={{ top: 30 + i * HOUR }}>{label12((DAY_START + i) * 60)}</div>
            ))}
          </div>
          {days.map((day) => {
            const isToday = day === todayCayman;
            const dayAppts = appts.filter((a) => cayDay(a.startAt) === day);
            const placed = layout(dayAppts);
            const [y, m, d] = partsOf(day);
            return (
              <div key={day} className={`cal-col ${isToday ? "today" : ""}`}>
                <div className="cal-colhead"><b>{DOW[weekdayMon(day)]}</b> {new Date(Date.UTC(y, m - 1, d)).getUTCDate()}</div>
                <div className="cal-slots"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDrop(e, day)}
                  onClick={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const min = DAY_START * 60 + Math.floor(((e.clientY - rect.top) / HOUR) * 60 / 15) * 15;
                  openNew(day, Math.max(DAY_START * 60, Math.min(min, (DAY_END - 1) * 60)));
                }}>
                  {Array.from({ length: DAY_END - DAY_START }, (_, i) => <div key={i} className="cal-line" style={{ top: i * HOUR }} />)}
                  {who !== "all" && closedRegions(who, day).map((r, i) => (
                    <div key={`c${i}`} className="cal-closed" style={{ top: ((r.s - DAY_START * 60) / 60) * HOUR, height: ((r.e - r.s) / 60) * HOUR }} />
                  ))}
                  {placed.map(({ a, s, e, lane, laneCount }) => {
                    const t = typeById(a.typeId);
                    const top = ((s - DAY_START * 60) / 60) * HOUR;
                    const height = Math.max(18, ((e - s) / 60) * HOUR - 2);
                    const width = 100 / laneCount, left = lane * width;
                    const color = a.kind === "block" ? "#8a929a" : (t?.color || "#2f8e93");
                    return (
                      <div key={a.id} className={`cal-appt st-${a.status}`} style={{ top, height, left: `${left}%`, width: `calc(${width}% - 3px)`, borderLeftColor: color }}
                        draggable onDragStart={(ev) => { ev.dataTransfer.setData("text/plain", a.id); ev.dataTransfer.effectAllowed = "move"; }}
                        onClick={(ev) => { ev.stopPropagation(); openEdit(a); }}>
                        <div className="cal-appt-t">{label12(s)}</div>
                        <div className="cal-appt-n">{a.kind === "block" ? (a.title || "Blocked") : (a.capacity > 1 ? `${(t?.name || "Group")} 👥` : a.clientName)}</div>
                        {a.kind !== "block" && <div className="cal-appt-m">{a.seriesId ? "↻ " : ""}{a.capacity > 1 ? `${(a.attendees || []).length}/${a.capacity} seats` : (t?.name || "Visit")}{who === "all" ? ` · ${clinName(a.clinicianId).split(" ").slice(-1)}` : ""}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {draft && (
        <div className="cal-modal" onClick={() => setDraft(null)}>
          <div className="cal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cal-sheethead">
              <div className="cal-kind">
                <button className={draft.kind !== "block" ? "on" : ""} onClick={() => setDraft({ ...draft, kind: "appointment" })}>Appointment</button>
                <button className={draft.kind === "block" ? "on" : ""} onClick={() => setDraft({ ...draft, kind: "block" })}>Block time</button>
              </div>
              <button className="cal-close" onClick={() => setDraft(null)}>×</button>
            </div>

            {err && <p className="cal-err">{err}</p>}

            <div className="cal-form">
              {draft.kind !== "block" ? (
                <>
                  {!isGroup(draft) && <>
                    <label className="cal-f grow"><span>Client name</span><input value={draft.clientName || ""} onChange={(e) => setDraft({ ...draft, clientName: e.target.value })} placeholder="Full name" autoFocus /></label>
                    <label className="cal-f grow"><span>Client email</span><input value={draft.clientEmail || ""} onChange={(e) => setDraft({ ...draft, clientEmail: e.target.value })} placeholder="for confirmation & reminders" /></label>
                  </>}
                  <label className="cal-f"><span>Appointment type</span>
                    <select value={draft.typeId || ""} onChange={(e) => pickType(e.target.value)}>
                      {types.length === 0 && <option value="">No types yet</option>}
                      {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </label>
                </>
              ) : (
                <label className="cal-f grow"><span>Label</span><input value={draft.title || ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Lunch, Admin, Leave" autoFocus /></label>
              )}

              <label className="cal-f"><span>Clinician</span>
                <select value={draft.clinicianId || ""} onChange={(e) => setDraft({ ...draft, clinicianId: e.target.value })}>
                  {clinicians.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="cal-f"><span>Date</span><input type="date" value={draft._date || ""} onChange={(e) => setDraft({ ...draft, _date: e.target.value })} /></label>
              <label className="cal-f"><span>Start</span><input type="time" value={hhmm(draft._startMin || 540)} onChange={(e) => { const [h, m] = e.target.value.split(":").map(Number); setDraft({ ...draft, _startMin: h * 60 + m }); }} /></label>
              <label className="cal-f"><span>Duration (min)</span><input type="number" min={5} step={5} value={draft._durMin || 50} onChange={(e) => setDraft({ ...draft, _durMin: Number(e.target.value) })} /></label>

              {!draft.id && draft.kind !== "block" && (
                <>
                  <label className="cal-f"><span>Repeat</span>
                    <select value={draft._repeatEvery || 0} onChange={(e) => setDraft({ ...draft, _repeatEvery: Number(e.target.value) })}>
                      <option value={0}>Doesn&apos;t repeat</option>
                      <option value={7}>Weekly</option>
                      <option value={14}>Every 2 weeks</option>
                      <option value={28}>Every 4 weeks</option>
                    </select>
                  </label>
                  {!!draft._repeatEvery && <label className="cal-f"><span>Occurrences</span><input type="number" min={2} max={52} value={draft._repeatCount || 4} onChange={(e) => setDraft({ ...draft, _repeatCount: Number(e.target.value) })} /></label>}
                </>
              )}

              {draft.kind !== "block" && (
                <>
                  <label className="cal-f"><span>Mode</span>
                    <select value={draft.mode || "in_person"} onChange={(e) => setDraft({ ...draft, mode: e.target.value as AppointmentMode })}>
                      {(["in_person", "virtual", "either"] as AppointmentMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
                    </select>
                  </label>
                  <label className="cal-f grow"><span>{draft.mode === "virtual" ? "Video link" : "Room / location"}</span><input value={draft.locationOrLink || ""} onChange={(e) => setDraft({ ...draft, locationOrLink: e.target.value })} placeholder={draft.mode === "virtual" ? "Zoom / Meet link" : "Room"} /></label>
                  <label className="cal-f"><span>Payment path</span>
                    <select value={draft.insurancePath || "self_pay"} onChange={(e) => setDraft({ ...draft, insurancePath: e.target.value as "self_pay" | "insurance" })}>
                      <option value="self_pay">Self-pay</option><option value="insurance">Insurance</option>
                    </select>
                  </label>
                  {draft.insurancePath === "insurance" && (
                    <>
                      <label className="cal-f"><span>Insurer</span>
                        <select value={draft.insurerId || ""} onChange={(e) => setDraft({ ...draft, insurerId: e.target.value || null })}>
                          <option value="">Choose…</option>
                          {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                        </select>
                      </label>
                      <label className="cal-f"><span>Policy no.</span><input value={draft.policyNo || ""} onChange={(e) => setDraft({ ...draft, policyNo: e.target.value })} /></label>
                    </>
                  )}
                </>
              )}
              <label className="cal-f grow"><span>Notes</span><input value={draft.notes || ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="optional" /></label>
            </div>

            {isGroup(draft) && (
              <div className="cal-roster">
                {!draft.id ? (
                  <p className="cal-roster-hint">Group session ({draft.capacity} seats). Create it, then add attendees here.</p>
                ) : (
                  <>
                    <div className="cal-roster-h">Attendees <span>{(draft.attendees || []).length} of {draft.capacity} seats</span></div>
                    {(draft.attendees || []).map((a, i) => (
                      <div key={i} className="cal-att">
                        <span className="cal-att-n">{a.name}{a.email ? ` · ${a.email}` : ""}</span>
                        <button type="button" onClick={() => setDraft({ ...draft, attendees: (draft.attendees || []).filter((_, j) => j !== i) })}>×</button>
                      </div>
                    ))}
                    {(draft.attendees || []).length < (draft.capacity || 1) ? (
                      <div className="cal-att-add">
                        <input placeholder="Name" value={attName} onChange={(e) => setAttName(e.target.value)} />
                        <input placeholder="Email (optional)" value={attEmail} onChange={(e) => setAttEmail(e.target.value)} />
                        <button type="button" onClick={() => { if (!attName.trim()) return; setDraft({ ...draft, attendees: [...(draft.attendees || []), { name: attName.trim(), email: attEmail.trim(), phone: "" }] }); setAttName(""); setAttEmail(""); }}>Add</button>
                      </div>
                    ) : <p className="cal-roster-hint">Full. Remove someone to free a seat.</p>}
                    <p className="cal-roster-hint">Remember to Save.</p>
                  </>
                )}
              </div>
            )}

            {draft.id && draft.kind !== "block" && (
              <div className="cal-status">
                <span className="cal-status-l">Status</span>
                {STATUS.map((s) => <button key={s.key} className={draft.status === s.key ? `on ${s.key}` : ""} onClick={() => setStatus(draft as Appointment, s.key)}>{s.label}</button>)}
              </div>
            )}
            {draft.id && draft.status === "seen" && draft.kind !== "block" && (
              <p className="cal-bridge">{draft.billingSessionId
                ? "✓ A billing session was created for this visit — it's in the billing queue for the biller."
                : "Marked seen. Turn on “Connect to billing” in Settings to make seen visits into billing sessions automatically."}</p>
            )}
            {draft.id && draft.seriesId && (
              <div className="cal-series-note">↻ Part of a recurring series. <button type="button" onClick={() => removeSeries(draft as Appointment)}>Remove this and all later</button></div>
            )}

            {draft.kind !== "block" && draft.clinicianId && draft._date && (() => {
              const blocks = workingBlocks(draft.clinicianId, draft._date);
              const s = draft._startMin ?? 0, e = s + (draft._durMin || 50);
              const outside = blocks !== null && !blocks.some((b) => s >= b.s && e <= b.e);
              return outside ? <p className="cal-warn">Outside {clinName(draft.clinicianId)}&apos;s set hours for that day. You can still book it.</p> : null;
            })()}

            <div className="cal-actions">
              {draft.id ? <button className="cal-btn del" onClick={() => remove(draft as Appointment)}>Delete</button> : <span />}
              <span className="cal-sp" />
              <button className="cal-btn" onClick={() => setDraft(null)}>Cancel</button>
              <button className="cal-btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : draft.id ? "Save" : "Book"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
