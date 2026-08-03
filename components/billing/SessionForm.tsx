"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DobInput from "./DobInput";

interface InsurerOpt { id: string; name: string; copayType: "none" | "fixed" | "percentage"; copayRate: number; }
interface CptOpt { code: string; description: string; fee: number; hrs: number; }
interface ClientOpt { id?: string | null; first: string; last: string; insurerId: string | null; lastVisit: string; visits: number; referralEnd?: string | null; }
const clientKey = (f: string, l: string) => `${f}|${l}`.toLowerCase().trim();

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
function suggestCopay(ins: InsurerOpt | undefined, total: number): number {
  if (!ins) return 0;
  if (ins.copayType === "fixed") return round2(ins.copayRate);
  if (ins.copayType === "percentage") return round2((total * ins.copayRate) / 100);
  return 0;
}

export default function SessionForm({ insurers, cptCodes, clients = [], forClinicians = [], usualCodes = [], alreadyLogged = [], today = "" }: {
  insurers: InsurerOpt[]; cptCodes: CptOpt[]; clients?: ClientOpt[];
  forClinicians?: { id: string; name: string }[];
  /** This clinician's most-used codes, most frequent first. */
  usualCodes?: string[];
  /** "clientkey@date" for every session already logged, to catch double entry. */
  alreadyLogged?: string[];
  today?: string;
}) {
  const router = useRouter();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [dob, setDob] = useState("");        // new client's date of birth (for the 1500)
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [pickedReferralEnd, setPickedReferralEnd] = useState<string | null>(null);
  const [picked, setPicked] = useState("");
  // Which kind of client this is. Default to "returning" only when there ARE
  // returning clients; nobody is pre-selected, so it can't pick one by accident.
  const [mode, setMode] = useState<"returning" | "new">(clients.length > 0 ? "returning" : "new");
  const [search, setSearch] = useState("");
  const [codeSearch, setCodeSearch] = useState("");
  // "Browse all codes" opens the full catalogue in a modal, so the inline form
  // stays short but every code is one tap away.
  const [showAll, setShowAll] = useState(false);
  const [saved, setSaved] = useState("");
  // Whether this visit goes through insurance or is paid in full on the day.
  // Kept separate from the insurer itself: an insured client may still choose
  // to pay upfront for a session, which is common in a psychology practice.
  const [payMode, setPayMode] = useState<"insurance" | "upfront">("upfront");
  // Self-pay disposition: paid in full now, owing (running balance), or waived.
  const [selfPay, setSelfPay] = useState<"paid" | "owing" | "waived">("paid");
  const [collectedNow, setCollectedNow] = useState("");
  // Only supplied when the biller is logging a claim for an outside clinician.
  const [forId, setForId] = useState(forClinicians[0]?.id ?? "");

  function pickClient(c: ClientOpt) {
    const k = clientKey(c.first, c.last);
    if (picked === k) { setPicked(""); setPickedId(null); setPickedReferralEnd(null); setFirst(""); setLast(""); setInsurerId(""); setPayMode("upfront"); resetCopay(); return; }
    // Carry their usual insurer over — it's nearly always the same next visit,
    // but they can still switch this visit to paid-upfront.
    setPicked(k); setPickedId(c.id ?? null); setPickedReferralEnd(c.referralEnd ?? null); setFirst(c.first); setLast(c.last);
    setInsurerId(c.insurerId || ""); setPayMode(c.insurerId ? "insurance" : "upfront");
    resetCopay();
  }

  /** Paying upfront means no insurer at all, so the money model treats the
   *  whole fee as collected at the visit. */
  function switchPay(next: "insurance" | "upfront") {
    if (next === payMode) return;
    setPayMode(next);
    if (next === "upfront") setInsurerId("");
    resetCopay();
  }

  /** Switching mode clears the client, so a half-finished choice can't leak
   *  across (e.g. picking someone, then typing a different new name). */
  function switchMode(next: "returning" | "new") {
    if (next === mode) return;
    setMode(next); setPicked(""); setPickedId(null); setPickedReferralEnd(null); setFirst(""); setLast(""); setDob(""); setInsurerId(""); setPayMode("upfront"); resetCopay(); setSearch("");
  }
  const [dos, setDos] = useState(today);
  const [insurerId, setInsurerId] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  // Co-pay has TWO numbers: what was DUE (the insurer's rule) and what was
  // actually COLLECTED. The gap is a write-off — money not collected that should
  // have been.
  const [collectedInput, setCollectedInput] = useState("");
  const [collectedTouched, setCollectedTouched] = useState(false);
  // How the co-pay was handled: collected / didn't collect (owed → invoice) / waived (written off).
  const [copayDisp, setCopayDisp] = useState<"collected" | "didnt" | "waived">("collected");
  // Self-pay discount (e.g. a 50% Adventist discount). Applies to upfront/self-pay
  // only; the discounted total is what's logged and drives every calculation.
  const [discountPct, setDiscountPct] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const resetCopay = () => { setCollectedTouched(false); setCollectedInput(""); setDiscountPct(""); setDiscountReason(""); setCopayDisp("collected"); };
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const insurer = useMemo(() => insurers.find((i) => i.id === insurerId), [insurers, insurerId]);
  const totalCost = useMemo(() => round2(codes.reduce((t, c) => t + (cptCodes.find((x) => x.code === c)?.fee || 0), 0)), [codes, cptCodes]);
  const duration = useMemo(() => round2(codes.reduce((t, c) => t + (cptCodes.find((x) => x.code === c)?.hrs || 0), 0)), [codes, cptCodes]);
  const suggested = suggestCopay(insurer, totalCost);
  // The co-pay figure the clinician enters is what was DUE (defaults to the
  // insurer's suggested rule). Whether it was collected depends on copayDisp:
  //   collected → taken at the visit; didn't collect → owed (biller invoices);
  //   waived → written off (not chased). Due stays set so we can track both.
  const copayAmt = round2(collectedTouched ? Number(collectedInput) || 0 : suggested);
  const copayCollected = copayDisp === "collected" ? copayAmt : 0;
  const copayDue = copayAmt;
  // Discount applies to self-pay only; the charged total is the fee less the discount.
  const discPct = payMode === "upfront" ? Math.min(100, Math.max(0, Number(discountPct) || 0)) : 0;
  const chargedTotal = discPct > 0 ? round2(totalCost * (1 - discPct / 100)) : totalCost;
  const collectedAtVisit = insurerId ? copayCollected
    : selfPay === "owing" ? Math.min(chargedTotal, Number(collectedNow) || 0)
    : selfPay === "waived" ? 0
    : chargedTotal;
  const billedToInsurance = insurerId ? Math.max(0, round2(totalCost - copayDue)) : 0;

  const toggle = (code: string) => { setCodes((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code])); resetCopay(); };
  // Close the "all codes" modal on Escape.
  useEffect(() => {
    if (!showAll) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowAll(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAll]);

  async function submit(e: React.FormEvent, andAnother = false) {
    e.preventDefault();
    if (busy) return; // never let a second click fire while a save is already in flight
    setError(""); setSaved("");
    if (!first.trim() || !last.trim()) {
      return setError(mode === "returning"
        ? "Pick the client this session was for, or switch to \u201cA new client\u201d."
        : "Client first and last name are required.");
    }
    if (payMode === "insurance" && !insurerId) return setError("Choose the insurer, or switch to \u201cPaid in full at the visit\u201d.");
    if (!dos) return setError("Date of service is required.");
    if (!codes.length) return setError("Select at least one service code.");
    setBusy(true);
    // A self-pay discount is baked into the charged total; record the reason so
    // the record shows why the fee was reduced.
    const discountNote = discPct > 0 ? `${discPct}% discount${discountReason.trim() ? ` — ${discountReason.trim()}` : ""} (full fee ${money(totalCost)})` : "";
    const finalNotes = [notes.trim(), discountNote].filter(Boolean).join(" · ");
    try {
      const res = await fetch("/api/billing/sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientFirst: first.trim(), clientLast: last.trim(), clientId: mode === "returning" ? pickedId : null, dob: mode === "new" && dob ? dob : null, insurerId: insurerId || null, dateOfService: dos, cptCodes: codes, durationHours: duration, totalCost: chargedTotal, copayCollected: payMode === "insurance" ? copayCollected : (selfPay === "owing" ? Number(collectedNow) || 0 : 0), copayDue: payMode === "insurance" ? copayDue : 0, selfPayStatus: payMode === "insurance" ? (copayDisp === "waived" ? "waived" : null) : (selfPay === "paid" ? null : selfPay), notes: finalNotes, ...(forId ? { clinicianId: forId } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the session.");
      if (andAnother) {
        // A clinician logging a day's work does several in a row, so keep the
        // date and clear only what changes from one client to the next.
        setSaved(`✓ Logged ${codes.join(", ")} for ${first.trim()} ${last.trim()} — ${money(chargedTotal)}${insurerId ? ` · ${insurer?.name}` : " · self-pay"}${dos ? ` · ${dos}` : ""}.`);
        setPicked(""); setPickedId(null); setPickedReferralEnd(null); setFirst(""); setLast(""); setDob(""); setInsurerId(""); setPayMode("upfront");
        setCodes([]); resetCopay(); setNotes(""); setSearch(""); setSelfPay("paid"); setCollectedNow("");
        setMode(clients.length > 0 ? "returning" : "new");
        setBusy(false);
        // Deliberately NO router.refresh() here. A full server refetch after every
        // entry can interrupt the next rapid entry (the reported "second one won't
        // save"). The session is already saved server-side; the payout/roster views
        // refresh when the clinician leaves the form (Save session, or Back).
        return;
      }
      router.push("/billing/me");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const usual = useMemo(
    () => usualCodes.map((c) => cptCodes.find((x) => x.code === c)).filter(Boolean) as CptOpt[],
    [usualCodes, cptCodes]);
  // A live search across EVERY code (number or description). Always available,
  // so a clinician can find any code by typing instead of hunting a long list.
  const matches = useMemo(() => {
    const q = codeSearch.trim().toLowerCase();
    if (!q) return [];
    return cptCodes.filter((c) => c.code.includes(q) || c.description.toLowerCase().includes(q));
  }, [cptCodes, codeSearch]);

  // Same client, same day — nearly always a double entry rather than two visits.
  const duplicate = useMemo(() => {
    if (!first.trim() || !last.trim() || !dos) return false;
    return alreadyLogged.includes(`${clientKey(first, last)}@${dos}`);
  }, [alreadyLogged, first, last, dos]);

  // The chosen client's referral has ended before this date of service — the
  // insurer won't pay for it.
  const pastReferral = !!pickedReferralEnd && !!dos && dos > pickedReferralEnd;

  const shownClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => `${c.first} ${c.last}`.toLowerCase().includes(q));
  }, [clients, search]);

  const yesterday = useMemo(() => {
    if (!today) return "";
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [today]);

  const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

  return (
    <form onSubmit={submit} className="ls-grid">
      <div className="ls-card">
        <div className="ls-form">
          {forClinicians.length > 0 && (
            <div className="ls-field">
              <label className="ls-q">Which clinician is this claim for? <span className="ls-req">*</span></label>
              <select className="ls-in" value={forId} onChange={(e) => setForId(e.target.value)}>
                {forClinicians.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="ls-field">
            <label className="ls-q">Who is this session for? <span className="ls-req">*</span></label>
            {clients.length > 0 && (
              <div className="ls-modes" role="tablist">
                <button type="button" role="tab" aria-selected={mode === "returning"} className={`ls-mode ${mode === "returning" ? "on" : ""}`} onClick={() => switchMode("returning")}>
                  Someone I&apos;ve seen before<small>{clients.length} client{clients.length === 1 ? "" : "s"}</small>
                </button>
                <button type="button" role="tab" aria-selected={mode === "new"} className={`ls-mode ${mode === "new" ? "on" : ""}`} onClick={() => switchMode("new")}>
                  A new client<small>first appointment</small>
                </button>
              </div>
            )}

            {mode === "returning" ? (
              <>
                {clients.length > 6 && (
                  <input
                    className="ls-in" value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search your clients…" aria-label="Search your clients"
                    style={{ marginBottom: 10 }}
                  />
                )}
                <div className="ls-clientlist">
                  {shownClients.length === 0 ? (
                    <p className="ls-none">No client matches &ldquo;{search}&rdquo;. Use <b>A new client</b> if this is their first appointment.</p>
                  ) : shownClients.map((c) => {
                    const k = clientKey(c.first, c.last);
                    return (
                      <button type="button" key={k} className={`ls-clientrow ${picked === k ? "on" : ""}`} onClick={() => pickClient(c)}>
                        <span className="nm">{c.first} {c.last}</span>
                        <span className="meta">{c.visits === 0 ? "from your records · no visit logged yet" : `${c.visits} visit${c.visits === 1 ? "" : "s"} · last ${c.lastVisit}`}</span>
                      </button>
                    );
                  })}
                </div>
                {picked && <p className="ls-picked">Logging another visit for <b>{first} {last}</b>. Their usual insurer is filled in below.</p>}
              </>
            ) : (
              <>
                <div className="ls-row2">
                  <input className="ls-in" placeholder="First" value={first} onChange={(e) => { setFirst(e.target.value); setPicked(""); }} />
                  <input className="ls-in" placeholder="Last" value={last} onChange={(e) => { setLast(e.target.value); setPicked(""); }} />
                </div>
                <label className="ls-q" style={{ marginTop: 10 }}>Date of birth <span className="opt">used to match records &amp; for insurance claims</span></label>
                <DobInput value={dob} onChange={setDob} />
              </>
            )}
          </div>
          <div className="ls-field">
            <label className="ls-q">Date of service <span className="ls-req">*</span></label>
            <div className="ls-dates">
              <input type="date" className="ls-in" style={{ maxWidth: 190 }} value={dos} onChange={(e) => setDos(e.target.value)} />
              {today && (
                <>
                  <button type="button" className={`ls-day ${dos === today ? "on" : ""}`} onClick={() => setDos(today)}>Today</button>
                  <button type="button" className={`ls-day ${dos === yesterday ? "on" : ""}`} onClick={() => setDos(yesterday)}>Yesterday</button>
                </>
              )}
            </div>
            {duplicate && (
              <p className="ls-dupe">
                You&apos;ve already logged a session for <b>{first} {last}</b> on this date. Carry on if they really were seen twice.
              </p>
            )}
            {pastReferral && (
              <p className="ls-refwarn">⚠ <b>{first} {last}</b>&apos;s referral ended {pickedReferralEnd}. A session on this date is after the referral and won&apos;t be paid.</p>
            )}
          </div>
          <div className="ls-field">
            <label className="ls-q">How is this session paid? <span className="ls-req">*</span></label>
            <div className="ls-modes" role="tablist">
              <button type="button" role="tab" aria-selected={payMode === "upfront"} className={`ls-mode ${payMode === "upfront" ? "on" : ""}`} onClick={() => switchPay("upfront")}>
                Paid in full at the visit<small>nothing goes to insurance</small>
              </button>
              <button type="button" role="tab" aria-selected={payMode === "insurance"} className={`ls-mode ${payMode === "insurance" ? "on" : ""}`} onClick={() => switchPay("insurance")}>
                Through insurance<small>co-pay now, rest billed</small>
              </button>
            </div>
            {payMode === "insurance" && (
              <select className="ls-sel" style={{ marginTop: 10 }} value={insurerId} onChange={(e) => { setInsurerId(e.target.value); resetCopay(); }} aria-label="Insurance provider">
                <option value="">Choose the insurer…</option>
                {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            )}
          </div>
          <div className="ls-field">
            <label className="ls-q">Service code(s) <span className="ls-req">*</span></label>
            <p className="ls-help" style={{ marginTop: 0 }}>Type a number or name to find a code, or tap one of your usual ones. Tap a selected code again (or its <b>×</b>) to remove it.</p>
            {codes.length > 0 && (
              <div className="ls-selcodes">
                {codes.map((code) => { const c = cptCodes.find((x) => x.code === code); return (
                  <button type="button" key={code} className="ls-selchip" onClick={() => toggle(code)} title="Remove this code">
                    <span>{code}{c ? ` · ${money(c.fee)}` : ""}</span><span className="x">×</span>
                  </button>
                ); })}
              </div>
            )}
            <div className="ls-codesearch">
              <input
                className="ls-in" value={codeSearch} onChange={(e) => setCodeSearch(e.target.value)}
                placeholder="Search by code or name — e.g. 90837 or psychotherapy" aria-label="Search service codes"
              />
              <button type="button" className="ls-seeall" onClick={() => setShowAll(true)}>
                See all {cptCodes.length} codes
              </button>
            </div>
            {codeSearch.trim() ? (
              <div className="ls-cptlist tall">
                {matches.length === 0 ? (
                  <p className="ls-none">No code matches &ldquo;{codeSearch}&rdquo;.</p>
                ) : matches.map((c) => (
                  <button type="button" key={c.code} className={`ls-code ${codes.includes(c.code) ? "on" : ""}`} onClick={() => toggle(c.code)}>
                    <span className="cd">{c.code}</span>
                    <span className="ds">{c.description || "—"}</span>
                    <span className="fe">{money(c.fee)}</span>
                  </button>
                ))}
              </div>
            ) : usual.length > 0 ? (
              <>
                <p className="ls-codelab">Your most-used codes</p>
                <div className="ls-cptlist">
                  {usual.map((c) => (
                    <button type="button" key={c.code} className={`ls-code ${codes.includes(c.code) ? "on" : ""}`} onClick={() => toggle(c.code)}>
                      <span className="cd">{c.code}</span>
                      <span className="ds">{c.description || "—"}</span>
                      <span className="fe">{money(c.fee)}</span>
                    </button>
                  ))}
                </div>
                <p className="ls-help" style={{ marginTop: 8 }}>Need a different code? Start typing in the box above.</p>
              </>
            ) : (
              <div className="ls-cptlist tall">
                {cptCodes.map((c) => (
                  <button type="button" key={c.code} className={`ls-code ${codes.includes(c.code) ? "on" : ""}`} onClick={() => toggle(c.code)}>
                    <span className="cd">{c.code}</span>
                    <span className="ds">{c.description || "—"}</span>
                    <span className="fe">{money(c.fee)}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="ls-help">Total cost and duration fill in automatically from the codes you pick.</p>
          </div>
          <div className="ls-field">
            <div className="ls-row2">
              <div style={{ flex: 1 }}>
                <label className="ls-q">Total service cost</label>
                <div className="ls-money"><span className="cur">$</span><input className="ls-in ls-ro" readOnly value={totalCost ? totalCost.toFixed(2) : "0.00"} /></div>
              </div>
              <div style={{ flex: 1 }}>
                <label className="ls-q">Duration</label>
                <input className="ls-in ls-ro" readOnly value={`${duration} hr${duration === 1 ? "" : "s"}`} />
              </div>
            </div>
          </div>
          {payMode === "upfront" && totalCost > 0 && (
          <div className="ls-field">
            <label className="ls-q">Discount <span className="opt">reduces the fee — e.g. Adventist 50%</span></label>
            <div className="ls-row2">
              <div style={{ width: 120 }}>
                <span className="ls-sublab">% off</span>
                <input className="ls-in" type="number" step="1" min="0" max="100" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} placeholder="0" />
              </div>
              <div style={{ flex: 1 }}>
                <span className="ls-sublab">Reason</span>
                <input className="ls-in" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="e.g. Adventist" />
              </div>
              <button type="button" className="ls-writeoff" onClick={() => { setDiscountPct("50"); if (!discountReason.trim()) setDiscountReason("Adventist"); }}>50% Adventist</button>
            </div>
            {discPct > 0 && <p className="ls-uncollected" style={{ color: "var(--teal-deep, #2c7a7e)" }}>Charging <b>{money(chargedTotal)}</b> — {discPct}% off the {money(totalCost)} fee.</p>}
          </div>
          )}
          {payMode === "upfront" && chargedTotal > 0 && (
          <div className="ls-field">
            <label className="ls-q">Was it paid?</label>
            <div className="ls-seg3" role="tablist">
              <button type="button" role="tab" aria-selected={selfPay === "paid"} className={`ls-segbtn ${selfPay === "paid" ? "on" : ""}`} onClick={() => setSelfPay("paid")}>Paid in full<small>collected today</small></button>
              <button type="button" role="tab" aria-selected={selfPay === "owing"} className={`ls-segbtn ${selfPay === "owing" ? "on" : ""}`} onClick={() => setSelfPay("owing")}>Didn&apos;t collect<small>owed &middot; invoice</small></button>
              <button type="button" role="tab" aria-selected={selfPay === "waived"} className={`ls-segbtn ${selfPay === "waived" ? "on" : ""}`} onClick={() => setSelfPay("waived")}>Waive<small>written off</small></button>
            </div>
            {selfPay === "owing" && (
              <div style={{ marginTop: 10 }}>
                <span className="ls-sublab">Collected today (leave 0 if nothing paid)</span>
                <input className="ls-in" type="number" step="0.01" min="0" max={chargedTotal} value={collectedNow} onChange={(e) => setCollectedNow(e.target.value)} placeholder="0" style={{ maxWidth: 160 }} />
                <p className="ls-uncollected" style={{ color: "#9a3b2a" }}><b>{money(Math.max(0, chargedTotal - (Number(collectedNow) || 0)))}</b> is still owed — it goes to the biller&apos;s <b>Owed by clients</b> list to invoice. Choose <b>Waive</b> instead only if you&apos;re writing it off.</p>
              </div>
            )}
            {selfPay === "waived" && <p className="ls-uncollected" style={{ color: "var(--muted)" }}>The {money(chargedTotal)} fee is <b>waived</b> — written off, never chased. Choose <b>Didn&apos;t collect</b> instead if the client still owes it.</p>}
          </div>
          )}
          {payMode === "insurance" && (
          <div className="ls-field">
            <label className="ls-q">Co-pay</label>
            {!insurerId ? (
              <p className="ls-help" style={{ marginTop: 0 }}>Choose the insurer above to see the suggested co-pay.</p>
            ) : (
              <>
                <p className="ls-help" style={{ marginTop: 0 }}>
                  {suggested > 0
                    ? <>Based on <b>{insurer?.name}</b> rules, the co-pay due should be <b>{money(suggested)}</b>. Plans vary from client to client — enter the specific amount for this client.</>
                    : <><b>{insurer?.name}</b> has no standard co-pay. Enter an amount only if this client&apos;s plan requires one.</>}
                </p>
                <div style={{ width: 170, marginBottom: 10 }}>
                  <span className="ls-sublab">{copayDisp === "collected" ? "Amount collected" : "Amount due"}</span>
                  <div className="ls-money"><span className="cur">$</span><input className="ls-in" type="number" step="0.01" min="0" placeholder="0.00" value={collectedTouched ? collectedInput : (suggested ? String(suggested) : "")} onChange={(e) => { setCollectedTouched(true); setCollectedInput(e.target.value); }} /></div>
                </div>
                <div className="ls-seg3" role="tablist">
                  <button type="button" role="tab" aria-selected={copayDisp === "collected"} className={`ls-segbtn ${copayDisp === "collected" ? "on" : ""}`} onClick={() => setCopayDisp("collected")}>Collected<small>taken at visit</small></button>
                  <button type="button" role="tab" aria-selected={copayDisp === "didnt"} className={`ls-segbtn ${copayDisp === "didnt" ? "on" : ""}`} onClick={() => setCopayDisp("didnt")}>Didn&apos;t collect<small>owed &middot; invoice</small></button>
                  <button type="button" role="tab" aria-selected={copayDisp === "waived"} className={`ls-segbtn ${copayDisp === "waived" ? "on" : ""}`} onClick={() => setCopayDisp("waived")}>Waive<small>written off</small></button>
                </div>
                {copayDisp === "didnt" && copayAmt > 0 && <p className="ls-uncollected" style={{ color: "#9a3b2a" }}><b>{money(copayAmt)}</b> is still owed — it goes to the biller&apos;s <b>Owed by clients</b> list to invoice. Choose <b>Waive</b> instead only if you&apos;re writing it off for good.</p>}
                {copayDisp === "waived" && copayAmt > 0 && <p className="ls-uncollected" style={{ color: "var(--muted)" }}><b>{money(copayAmt)}</b> waived — written off, never chased. Choose <b>Didn&apos;t collect</b> instead if the client still owes it.</p>}
              </>
            )}
          </div>
          )}
          <div className="ls-field">
            <label className="ls-q">Notes <span className="opt">optional</span></label>
            <textarea className="ls-in" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <div className="ls-err">{error}</div>}
          {saved && <div className="ls-saved">{saved} Ready for the next one.</div>}
          <div className="ls-submit">
            <button type="submit" className="ls-save" disabled={busy}>{busy ? "Saving…" : "Save session"}</button>
            <button type="button" className="ls-savemore" disabled={busy} onClick={(e) => submit(e, true)}>
              Save &amp; log another
            </button>
          </div>
        </div>
      </div>

      <div className="ls-card ls-sum">
        <span className="lab">This session</span>
        <div className="fee">{money(totalCost)}</div>
        <div className="feesub">{codes.length ? `${codes.join(", ")} · ${duration} hr${duration === 1 ? "" : "s"}` : "Pick a service code to begin"}</div>
        <div className="ls-splitbar">
          <i style={{ width: `${pct(collectedAtVisit, totalCost)}%`, background: "var(--teal)" }} />
          <i style={{ width: `${pct(billedToInsurance, totalCost)}%`, background: "var(--indigo)" }} />
        </div>
        <div className="ls-sline"><span className="k"><span className="ls-dot" style={{ background: "var(--teal)" }} />Collected at visit</span><span className="v">{money(collectedAtVisit)}</span></div>
        <div className="ls-sline"><span className="k"><span className="ls-dot" style={{ background: "var(--indigo)" }} />Billed to insurance</span><span className="v">{money(billedToInsurance)}</span></div>
        {insurerId ? (
          <div className="ls-status ins"><span className="ic">→</span><span>{money(billedToInsurance)} enters the billing queue for <b>{insurer?.name}</b> once you save.</span></div>
        ) : (
          selfPay === "owing" ? (
            <div className="ls-status self"><span className="ic">→</span><span>Self-pay — {money(collectedAtVisit)} collected, <b>{money(Math.max(0, chargedTotal - collectedAtVisit))}</b> owed by the client (shows in the biller&apos;s balances).</span></div>
          ) : selfPay === "waived" ? (
            <div className="ls-status self"><span className="ic">–</span><span>Self-pay — the {money(chargedTotal)} fee is waived (written off).</span></div>
          ) : (
            <div className="ls-status self"><span className="ic">✓</span><span>Self-pay — the full {money(chargedTotal)} is collected at the visit, nothing goes to insurance.</span></div>
          )
        )}
      </div>

      {showAll && (
        <div className="ls-modal-ov" onClick={() => setShowAll(false)}>
          <div className="ls-modal" role="dialog" aria-modal="true" aria-label="All service codes" onClick={(e) => e.stopPropagation()}>
            <div className="ls-modal-head">
              <span>All service codes</span>
              <button type="button" className="ls-modal-x" onClick={() => setShowAll(false)} aria-label="Close">×</button>
            </div>
            <input
              className="ls-in" value={codeSearch} onChange={(e) => setCodeSearch(e.target.value)}
              placeholder="Search by code or name — e.g. 90837 or psychotherapy" aria-label="Search service codes"
              autoFocus
            />
            <div className="ls-cptlist ls-modal-list">
              {(codeSearch.trim() ? matches : cptCodes).length === 0 ? (
                <p className="ls-none">No code matches &ldquo;{codeSearch}&rdquo;.</p>
              ) : (codeSearch.trim() ? matches : cptCodes).map((c) => (
                <button type="button" key={c.code} className={`ls-code ${codes.includes(c.code) ? "on" : ""}`} onClick={() => toggle(c.code)}>
                  <span className="cd">{c.code}</span>
                  <span className="ds">{c.description || "—"}</span>
                  <span className="fe">{money(c.fee)}</span>
                </button>
              ))}
            </div>
            <div className="ls-modal-foot">
              <span className="ls-modal-count">{codes.length ? `${codes.length} selected` : "Tap codes to add them"}</span>
              <button type="button" className="ls-modal-done" onClick={() => setShowAll(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
