"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

type Mode = "in_person" | "virtual" | "either";
type QKind = "text" | "textarea" | "select" | "checkbox";
interface BookingQuestion { id: string; label: string; kind: QKind; required: boolean; options: string[]; }
interface Type { id: string; name: string; category: string; description: string; durationMin: number; price: number; mode: Mode; color: string; capacity: number; hasIntake: boolean; newClientIntakeOnly: boolean; questions: BookingQuestion[]; }
interface Clin { id: string; name: string; credentials: string; photo?: string; }
interface Insurer { id: string; name: string; }
interface Slot { minute: number; clinicianId: string; seatsLeft?: number; }
type Step = "service" | "clinician" | "time" | "details" | "confirm" | "done" | "waitlist" | "waitlisted";

const CAY = 5;
const pad = (n: number) => String(n).padStart(2, "0");
const utcFromCay = (dateStr: string, minute: number) => { const [y, m, d] = dateStr.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, CAY + Math.floor(minute / 60), minute % 60)).toISOString(); };
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const initials = (name: string) => name.replace(/\(.*?\)/g, "").split(/\s+/).filter((w) => w && !/^(dr|mrs|mr|ms|miss)\.?$/i.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const MODE_LABEL: Record<Mode, string> = { in_person: "In person", virtual: "Virtual", either: "In person or virtual" };

// A service can be offered in person, online, or both. The catalogue stores
// those as separate types (e.g. "Grief Counselling - In Person" and
// "Grief Counselling - Online"); we pair them by their base name so the client
// picks the service once, then chooses the mode. Variants whose base name +
// duration do not match (e.g. a 1hr in-person vs a 1.5hr online counselling)
// simply stay as their own service, offered in the one mode.
type BookMode = "in_person" | "virtual";
interface Service { key: string; baseName: string; category: string; variants: Partial<Record<BookMode, Type>>; }
const baseName = (name: string) =>
  name.replace(/\s*-\s*(In Person Appointment|In Person|Online|Virtual)\b/i, "").replace(/\s{2,}/g, " ").trim();

export default function BookingFlow({ practiceName, types, clinicians, insurers, preview, welcome, accent, policy, initialTypeId, initialClinician }: {
  practiceName: string; types: Type[]; clinicians: Clin[]; insurers: Insurer[]; preview: string; welcome?: string; accent?: string; policy?: string; initialTypeId?: string; initialClinician?: string;
}) {
  const tz = useMemo(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "your timezone"; } }, []);
  // Direct scheduling links: /book?type=<id>&clinician=<id> jumps straight in.
  const deepType = initialTypeId ? types.find((t) => t.id === initialTypeId) || null : null;
  const deepClin = initialClinician && clinicians.some((c) => c.id === initialClinician) ? initialClinician : "";
  const [step, setStep] = useState<Step>(deepType ? (deepClin ? "time" : "clinician") : "service");
  const [type, setType] = useState<Type | null>(deepType);
  const [clin, setClin] = useState<string>(deepClin || "any"); // "any" or id
  const [date, setDate] = useState<string>("");
  const [slot, setSlot] = useState<Slot | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState({ name: "", email: "", phone: "", path: "self_pay" as "self_pay" | "insurance", insurerId: "", policyNo: "", notes: "" });
  const [answers, setAnswers] = useState<Record<string, string>>({}); // questionId -> value
  const [chosenMode, setChosenMode] = useState<"in_person" | "virtual">("in_person"); // for "either" services
  const [monthMode, setMonthMode] = useState(false); // "book several this month" (pick a time per session)
  const [picks, setPicks] = useState<{ date: string; minute: number; clinicianId: string }[]>([]); // chosen sessions
  const [seriesResult, setSeriesResult] = useState<{ booked: number; skipped: number } | null>(null);
  const MONTH_CAP = 8; // most sessions a client can book in one go
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [confirmed, setConfirmed] = useState<{ startAt: string; id: string } | null>(null);
  const [remembered, setRemembered] = useState(false);
  const [firstVisit, setFirstVisit] = useState<"" | "yes" | "no">(""); // "have you been here before?"
  const [intakeSent, setIntakeSent] = useState<string[]>([]); // forms emailed on booking
  const [category, setCategory] = useState<string | null>(null); // chosen category on the service step
  const [group, setGroup] = useState<Service | null>(null); // chosen service (its in-person/online variants)

  // Pair the mode-specific types into one service each, so the client picks the
  // service, then the mode (see Service above).
  const services = useMemo(() => {
    const list: Service[] = [];
    const index = new Map<string, Service>();
    for (const t of types) {
      const cat = t.category.trim() || "Other";
      const key = `${cat}|${baseName(t.name)}`;
      let s = index.get(key);
      if (!s) { s = { key, baseName: baseName(t.name), category: cat, variants: {} }; index.set(key, s); list.push(s); }
      const m: BookMode = t.mode === "virtual" ? "virtual" : "in_person";
      if (!s.variants[m]) s.variants[m] = t;
    }
    return list;
  }, [types]);

  // Services grouped by category, in first-seen order, so clients pick a
  // category first (like Acuity) instead of scrolling one long list.
  const categories = useMemo(() => {
    const order: string[] = [];
    const byCat = new Map<string, Service[]>();
    for (const s of services) {
      if (!byCat.has(s.category)) { byCat.set(s.category, []); order.push(s.category); }
      byCat.get(s.category)!.push(s);
    }
    // Free Online Consultation leads, then the rest in their natural order.
    order.sort((a, b) => (/free online/i.test(b) ? 1 : 0) - (/free online/i.test(a) ? 1 : 0));
    return order.map((name) => ({ name, items: byCat.get(name)! }));
  }, [services]);
  const groupByCategory = categories.length > 1; // one category: keep the flat list
  const shownServices = category ? (categories.find((c) => c.name === category)?.items ?? []) : services;

  // A service's default variant (in person if offered, else online) and its modes.
  const svcDefault = (s: Service) => (s.variants.in_person || s.variants.virtual)!;
  const svcModes = (s: Service) => [s.variants.in_person && "in_person", s.variants.virtual && "virtual"].filter(Boolean) as BookMode[];
  function pickService(s: Service) {
    const def = svcDefault(s);
    setGroup(s); setType(def); setChosenMode(def.mode === "virtual" ? "virtual" : "in_person"); setStep("clinician");
  }
  function selectMode(m: BookMode) {
    if (!group?.variants[m]) return;
    setType(group.variants[m]!); setChosenMode(m);
  }

  // Returning clients: remember their details in THEIR OWN browser only, so they
  // don't re-type name / email / insurance / policy. Never leaves the device.
  const REMEMBER_KEY = "ec-booking-client";
  useEffect(() => {
    try {
      const raw = localStorage.getItem(REMEMBER_KEY);
      if (raw) { const p = JSON.parse(raw); setDetails((d) => ({ ...d, ...p })); setRemembered(true); }
    } catch { /* storage unavailable */ }
  }, []);
  function forgetMe() {
    try { localStorage.removeItem(REMEMBER_KEY); } catch { /* ignore */ }
    setDetails({ name: "", email: "", phone: "", path: "self_pay", insurerId: "", policyNo: "", notes: "" });
    setRemembered(false);
  }

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

  // Month picks belong to one clinician + service; clear them if either changes,
  // or if the client switches to "any available" (month booking needs a specific clinician).
  useEffect(() => { setMonthMode(false); setPicks([]); }, [clin, type?.id]);

  const grouped = useMemo(() => {
    const g: { label: string; items: Slot[] }[] = [{ label: "Morning", items: [] }, { label: "Afternoon", items: [] }, { label: "Evening", items: [] }];
    for (const s of slots) {
      const h = new Date(utcFromCay(date, s.minute)).getHours();
      g[h < 12 ? 0 : h < 17 ? 1 : 2].items.push(s);
    }
    return g.filter((x) => x.items.length);
  }, [slots, date]);
  const isGroupType = !!type && (type.capacity || 1) > 1; // PEERS-style group session

  async function joinWaitlist() {
    if (!type) return;
    if (!details.name.trim()) { setErr("Please enter your name."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(details.email)) { setErr("Please enter a valid email."); return; }
    setBusy(true); setErr("");
    const res = await fetch("/api/book/waitlist", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preview, typeId: type.id, clinicianId: clin !== "any" ? clin : null, name: details.name, email: details.email, phone: details.phone, note: details.notes }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "Could not join the waitlist."); return; }
    try { localStorage.setItem(REMEMBER_KEY, JSON.stringify({ name: details.name, email: details.email, phone: details.phone, path: details.path, insurerId: details.insurerId, policyNo: details.policyNo })); } catch { /* ignore */ }
    setStep("waitlisted");
  }

  // "Book several this month": pick an open time per session (each confirmed
  // available, so nothing is ever skipped). Only offered with a specific clinician.
  const isPicked = (d: string, m: number) => picks.some((p) => p.date === d && p.minute === m);
  function togglePick(d: string, m: number, clinicianId: string) {
    setErr("");
    setPicks((prev) => {
      if (prev.some((p) => p.date === d && p.minute === m)) return prev.filter((p) => !(p.date === d && p.minute === m));
      if (prev.length >= MONTH_CAP) { setErr(`You can book up to ${MONTH_CAP} sessions at once.`); return prev; }
      return [...prev, { date: d, minute: m, clinicianId }].sort((a, b) => (a.date === b.date ? a.minute - b.minute : a.date.localeCompare(b.date)));
    });
  }
  const usingMonth = () => monthMode && picks.length > 0;

  async function book() {
    if (!type) return;
    const month = usingMonth();
    if (!month && !slot) return;
    if (!details.name.trim()) { setErr("Please enter your name."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(details.email)) { setErr("Please enter a valid email."); return; }
    const missing = type.questions.find((q) => q.required && !String(answers[q.id] || "").trim());
    if (missing) { setErr(`Please answer: ${missing.label}`); return; }
    setBusy(true); setErr("");
    const clinicianId = month ? picks[0].clinicianId : slot!.clinicianId;
    const res = await fetch("/api/book/create", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preview, typeId: type.id, clinicianId, ...details, insurancePath: details.path, mode: chosenMode, firstVisit: firstVisit === "yes", answers,
        ...(month ? { sessions: picks.map((p) => ({ date: p.date, minute: p.minute })) } : { date, minute: slot!.minute }) }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "Could not book. Please try again."); if (res.status === 409) { setStep("time"); } return; }
    setIntakeSent(Array.isArray(data.intakeSent) ? data.intakeSent : []);
    setSeriesResult(data.series && data.series.booked > 1 ? { booked: data.series.booked, skipped: data.series.skipped || 0 } : null);
    try {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify({
        name: details.name, email: details.email, phone: details.phone,
        path: details.path, insurerId: details.insurerId, policyNo: details.policyNo,
      }));
    } catch { /* storage unavailable */ }
    setConfirmed({ startAt: data.appointment.startAt, id: data.appointment.id }); setStep("done");
  }

  const STEPS: Step[] = ["service", "clinician", "time", "details"];
  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="bk-page" style={accent ? ({ "--bk-accent": accent } as CSSProperties) : undefined}>
      <div className="bk-shell">
        <header className="bk-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="bk-logo" src="/tifec-mark.png" alt="" />
          <div className="bk-brand">{practiceName}</div>
          <div className="bk-title">Book an appointment</div>
          {welcome && <p className="bk-welcome-msg">{welcome}</p>}
        </header>

        {step !== "done" && step !== "waitlist" && step !== "waitlisted" && (
          <div className="bk-steps">
            {STEPS.map((s, i) => (
              <div key={s} className={`bk-dot ${i === stepIndex ? "on" : ""} ${i < stepIndex ? "done" : ""}`}>
                <span>{i + 1}</span><b>{s === "service" ? "Service" : s === "clinician" ? "Clinician" : s === "time" ? "Time" : "Details"}</b>
              </div>
            ))}
          </div>
        )}

        {step !== "service" && step !== "done" && step !== "waitlist" && step !== "waitlisted" && (
          <button className="bk-back" onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)])}>← Back</button>
        )}

        {/* 1. Service */}
        {step === "service" && (
          <section className="bk-sec">
            {types.length === 0 && <p className="bk-empty">No services are available to book right now.</p>}

            {groupByCategory && category === null ? (
              <>
                <h2 className="bk-h2">What would you like to book?</h2>
                <div className="bk-cards">
                  {categories.map((c) => (
                    <button key={c.name} className="bk-card" onClick={() => setCategory(c.name)}>
                      <span className="bk-cardmain">
                        <span className="bk-cardname">{c.name}</span>
                        <span className="bk-cardmeta">{c.items.length} service{c.items.length === 1 ? "" : "s"}</span>
                      </span>
                      <span className="bk-chev">→</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {groupByCategory && (
                  <button className="bk-back" onClick={() => setCategory(null)}>← All categories</button>
                )}
                <h2 className="bk-h2">{category || "What would you like to book?"}</h2>
                <div className="bk-cards">
                  {shownServices.map((s) => {
                    const def = svcDefault(s);
                    const modes = svcModes(s);
                    const modeText = modes.length > 1 ? "In person or Online" : modes[0] === "virtual" ? "Online" : "In person";
                    return (
                      <button key={s.key} className="bk-card" onClick={() => pickService(s)}>
                        <span className="bk-accent" style={{ background: def.color }} />
                        <span className="bk-cardmain">
                          <span className="bk-cardname">{s.baseName}</span>
                          {def.description && <span className="bk-carddesc">{def.description}</span>}
                          <span className="bk-cardmeta">{def.durationMin} min · {modeText}{def.price > 0 ? ` · ${money(def.price)}` : ""}</span>
                        </span>
                        <span className="bk-chev">→</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
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
                  <span className="bk-avatar">{c.photo ? <img className="bk-avatar-img" src={c.photo} alt="" /> : initials(c.name)}</span>
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
            {group && group.variants.in_person && group.variants.virtual && (
              <div className="bk-modepick">
                <span className="bk-modelbl">This service is offered both in person and online, with the same available times. Choose how you&apos;d like to meet:</span>
                <div className="bk-modecards">
                  <button type="button" className={`bk-modecard ${chosenMode === "in_person" ? "on" : ""}`} aria-pressed={chosenMode === "in_person"} onClick={() => selectMode("in_person")}>
                    <span className="bk-modeic" aria-hidden>🏢</span>
                    <span className="bk-modename">In person</span>
                    <span className="bk-modesub">Visit us at the clinic</span>
                    <span className="bk-modeavail">Available</span>
                  </button>
                  <button type="button" className={`bk-modecard ${chosenMode === "virtual" ? "on" : ""}`} aria-pressed={chosenMode === "virtual"} onClick={() => selectMode("virtual")}>
                    <span className="bk-modeic" aria-hidden>💻</span>
                    <span className="bk-modename">Online</span>
                    <span className="bk-modesub">Secure video from anywhere</span>
                    <span className="bk-modeavail">Available</span>
                  </button>
                </div>
              </div>
            )}
            {!isGroupType && clin !== "any" && (
              <div className="bk-monthpick">
                <div className="bk-seg bk-monthseg">
                  <button type="button" className={!monthMode ? "on" : ""} onClick={() => { setMonthMode(false); setPicks([]); }}>One session</button>
                  <button type="button" className={monthMode ? "on" : ""} onClick={() => { setMonthMode(true); setSlot(null); }}>Several this month</button>
                </div>
                {monthMode && <p className="bk-monthhint">Tap the times you&apos;d like across the month, up to {MONTH_CAP}. Every time you pick is open, so none get skipped.</p>}
              </div>
            )}
            <div className="bk-daystrip">
              {dayChips.map((c) => {
                const picksOn = monthMode ? picks.filter((p) => p.date === c.date).length : 0;
                return (
                  <button key={c.date} className={`bk-day ${date === c.date ? "on" : ""}`} onClick={() => setDate(c.date)}>
                    <span className="bk-dow">{c.dow}</span><span className="bk-dnum">{c.d}</span><span className="bk-dmon">{c.mon}</span>
                    {picksOn > 0 && <span className="bk-daydot">{picksOn}</span>}
                  </button>
                );
              })}
            </div>
            {isGroupType && <p className="bk-grouphint">This is a group session. Pick a scheduled time below and reserve your seat.</p>}
            {!date && <p className="bk-hint">Choose a day to see {isGroupType ? "scheduled sessions" : "open times"}.</p>}
            {date && loading && <p className="bk-hint">Finding {isGroupType ? "sessions" : "open times"}…</p>}
            {date && !loading && slots.length === 0 && <p className="bk-empty">{isGroupType ? "No group sessions scheduled on this day. Try another." : "No open times on this day. Try another."}</p>}
            {date && !loading && grouped.map((g) => (
              <div key={g.label} className="bk-slotgroup">
                <div className="bk-slotlabel">{g.label}</div>
                <div className="bk-slots">
                  {g.items.map((s, i) => {
                    const iso = utcFromCay(date, s.minute);
                    const on = monthMode ? isPicked(date, s.minute) : slot === s;
                    return <button key={i} className={`bk-slot ${on ? "on" : ""}`} onClick={() => { if (monthMode) togglePick(date, s.minute, s.clinicianId); else { setSlot(s); setStep("details"); } }}>{fmtTime(iso)}{typeof s.seatsLeft === "number" && <span className="bk-seats">{s.seatsLeft} seat{s.seatsLeft === 1 ? "" : "s"} left</span>}</button>;
                  })}
                </div>
              </div>
            ))}
            {slots.length > 0 && <p className="bk-tznote">Times shown in <b>{tz}</b>. The clinic runs on Cayman time (EST).</p>}
            {monthMode && picks.length > 0 && (
              <div className="bk-picks">
                <div className="bk-picks-hd">Your sessions ({picks.length})</div>
                <div className="bk-picks-list">
                  {picks.map((p) => (
                    <div key={`${p.date}:${p.minute}`} className="bk-pick">
                      <span>{fmtDay(utcFromCay(p.date, p.minute))} · {fmtTime(utcFromCay(p.date, p.minute))}</span>
                      <button type="button" aria-label="Remove" onClick={() => togglePick(p.date, p.minute, p.clinicianId)}>✕</button>
                    </div>
                  ))}
                </div>
                {err && <p className="bk-err">{err}</p>}
                <button className="bk-cta" onClick={() => { setErr(""); setStep("details"); }}>Continue with {picks.length} session{picks.length === 1 ? "" : "s"} →</button>
              </div>
            )}
            <button className="bk-textbtn" onClick={() => { setErr(""); setStep("waitlist"); }}>Don&apos;t see a time that works? Join the waitlist →</button>
          </section>
        )}

        {step === "waitlist" && type && (
          <section className="bk-sec">
            <button className="bk-back" onClick={() => setStep("time")}>← Back</button>
            <h2 className="bk-h2">Join the waitlist</h2>
            <p className="bk-donesub" style={{ marginBottom: 18 }}>We&apos;ll reach out when a spot opens for <b>{type.name}</b>{clin !== "any" ? ` with ${clinName(clin)}` : ""}.</p>
            <div className="bk-form">
              <label className="bk-f"><span>Full name</span><input value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} autoFocus /></label>
              <label className="bk-f"><span>Email</span><input type="email" value={details.email} onChange={(e) => setDetails({ ...details, email: e.target.value })} placeholder="How we'll reach you" /></label>
              <label className="bk-f"><span>Phone <em>(optional)</em></span><input value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} /></label>
              <label className="bk-f"><span>When are you usually free? <em>(optional)</em></span><textarea rows={2} value={details.notes} onChange={(e) => setDetails({ ...details, notes: e.target.value })} placeholder="e.g. weekday mornings" /></label>
            </div>
            {err && <p className="bk-err">{err}</p>}
            <button className="bk-cta" onClick={joinWaitlist} disabled={busy}>{busy ? "Joining…" : "Join the waitlist"}</button>
          </section>
        )}

        {step === "waitlisted" && type && (
          <section className="bk-sec bk-done">
            <div className="bk-check" style={{ background: "linear-gradient(135deg,#3a7ea1,#2e3192)" }}>☑</div>
            <h2 className="bk-h2">You&apos;re on the waitlist</h2>
            <p className="bk-donesub">We&apos;ve added you for <b>{type.name}</b>. We&apos;ll be in touch at <b>{details.email}</b> as soon as a spot opens.</p>
            <button className="bk-textbtn" onClick={() => { setStep("time"); }}>Back to times</button>
          </section>
        )}

        {/* 4. Details */}
        {step === "details" && type && (slot || (monthMode && picks.length > 0)) && (
          <section className="bk-sec">
            <h2 className="bk-h2">Your details</h2>
            {remembered && <p className="bk-welcome">Welcome back{details.name ? `, ${details.name.split(" ")[0]}` : ""}, we&apos;ve filled in your details. <button type="button" onClick={forgetMe}>Not you?</button></p>}
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
              {type.mode === "either" && (
                <div className="bk-f"><span>How would you like to meet?</span>
                  <div className="bk-seg">
                    <button className={chosenMode === "in_person" ? "on" : ""} onClick={() => setChosenMode("in_person")}>In person</button>
                    <button className={chosenMode === "virtual" ? "on" : ""} onClick={() => setChosenMode("virtual")}>Virtual</button>
                  </div>
                </div>
              )}
              {type.questions.map((q) => (
                <label key={q.id} className="bk-f"><span>{q.label}{q.required && <em> (required)</em>}</span>
                  {q.kind === "textarea" ? (
                    <textarea rows={2} value={answers[q.id] || ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
                  ) : q.kind === "select" ? (
                    <select value={answers[q.id] || ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}>
                      <option value="">Choose…</option>{q.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : q.kind === "checkbox" ? (
                    <span className="bk-qcheck"><input type="checkbox" checked={answers[q.id] === "Yes"} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.checked ? "Yes" : "" })} /> Yes</span>
                  ) : (
                    <input value={answers[q.id] || ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
                  )}
                </label>
              ))}
              {!/free\s+online\s+consultation/i.test(type.name) && (
                <div className="bk-f"><span>Have you completed an intake form with us before?</span>
                  <div className="bk-seg">
                    <button type="button" className={firstVisit === "no" ? "on" : ""} onClick={() => setFirstVisit("no")}>Yes, I have</button>
                    <button type="button" className={firstVisit === "yes" ? "on" : ""} onClick={() => setFirstVisit("yes")}>No, I&apos;m new</button>
                  </div>
                </div>
              )}
            </div>
            {monthMode && picks.length > 0 && (
              <p className="bk-monthnote">You&apos;re booking <b>{picks.length} session{picks.length === 1 ? "" : "s"}</b> this month with {clinName(picks[0].clinicianId)}. Go back to add or remove times.</p>
            )}
            {!/free\s+online\s+consultation/i.test(type.name) && (firstVisit !== "no") && (
              <p className="bk-intake">We&apos;ll email you your intake form{/couples?|marriage|pre[\s-]?marital/i.test(type.name) ? "" : " and a short wellbeing screening"} to complete before your visit. It helps your clinician prepare.</p>
            )}
            {policy && <label className="bk-policy"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> <span><b>Cancellation policy.</b> {policy}</span></label>}
            {err && <p className="bk-err">{err}</p>}
            <button className="bk-cta" onClick={() => { if (policy && !agreed) { setErr("Please accept the cancellation policy."); return; } setErr(""); setStep("confirm"); }} disabled={!!policy && !agreed}>Review booking</button>
          </section>
        )}

        {/* 5. Confirm */}
        {step === "confirm" && type && (slot || (monthMode && picks.length > 0)) && (
          <section className="bk-sec">
            <h2 className="bk-h2">Confirm your booking</h2>
            <div className="bk-summary">
              <Row k="Service" v={type.name} />
              <Row k="Clinician" v={clin === "any" ? clinName((slot || picks[0]).clinicianId) : clinName(clin)} />
              {monthMode && picks.length > 0
                ? <Row k="Sessions" v={`${picks.length} this month`} />
                : <Row k="When" v={`${fmtDay(utcFromCay(date, slot!.minute))} · ${fmtTime(utcFromCay(date, slot!.minute))}`} />}
              <Row k="Length" v={`${type.durationMin} min · ${MODE_LABEL[type.mode]}`} />
              <Row k="You" v={`${details.name}${details.email ? " · " + details.email : ""}`} />
              <Row k="Payment" v={details.path === "insurance" ? `Insurance${details.insurerId ? " · " + (insurers.find((i) => i.id === details.insurerId)?.name || "") : ""}` : "Self-pay"} />
              {type.price > 0 && <Row k="Fee" v={monthMode && picks.length > 0 ? `${money(type.price)} × ${picks.length} = ${money(type.price * picks.length)}` : money(type.price)} strong />}
            </div>
            {monthMode && picks.length > 0 && (
              <div className="bk-picks-list bk-picks-confirm">
                {picks.map((p) => <div key={`${p.date}:${p.minute}`} className="bk-pick"><span>{fmtDay(utcFromCay(p.date, p.minute))} · {fmtTime(utcFromCay(p.date, p.minute))}</span></div>)}
              </div>
            )}
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
              <Row k="Clinician" v={clinName((slot || picks[0]).clinicianId)} />
              <Row k={seriesResult ? "First session" : "When"} v={`${fmtDay(confirmed.startAt)} · ${fmtTime(confirmed.startAt)}`} />
              {seriesResult && <Row k="Sessions" v={`${seriesResult.booked} booked`} />}
            </div>
            {seriesResult && <p className="bk-intake">You&apos;re booked for {seriesResult.booked} session{seriesResult.booked === 1 ? "" : "s"} this month.{seriesResult.skipped > 0 ? ` ${seriesResult.skipped} time${seriesResult.skipped === 1 ? " was" : "s were"} just taken, so we left ${seriesResult.skipped === 1 ? "it" : "them"} out. Reply to your confirmation and we&apos;ll help you find another.` : " They&apos;re all in your confirmation email and calendar invite."}</p>}
            {intakeSent.length > 0 && <p className="bk-intake">We&apos;ve emailed your {intakeSent.join(" and ")} to <b>{details.email}</b>. Completing {intakeSent.length > 1 ? "them" : "it"} before your visit helps us give you the best care.</p>}
            <a className="bk-managelink" href={`/book/manage?preview=${preview}&id=${confirmed.id}`}>Need to change it? Manage this booking →</a>
            <a className="bk-managelink" href="/portal">See all your appointments →</a>
            <button className="bk-textbtn" onClick={() => { setStep("service"); setType(null); setClin("any"); setDate(""); setSlot(null); setConfirmed(null); setSeriesResult(null); setMonthMode(false); setPicks([]); setDetails({ name: "", email: "", phone: "", path: "self_pay", insurerId: "", policyNo: "", notes: "" }); }}>Book another</button>
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
