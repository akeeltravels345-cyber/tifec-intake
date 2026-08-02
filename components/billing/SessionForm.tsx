"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  const [showAllCodes, setShowAllCodes] = useState(false);
  const [saved, setSaved] = useState("");
  // Whether this visit goes through insurance or is paid in full on the day.
  // Kept separate from the insurer itself: an insured client may still choose
  // to pay upfront for a session, which is common in a psychology practice.
  const [payMode, setPayMode] = useState<"insurance" | "upfront">("upfront");
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
  const [dueInput, setDueInput] = useState("");
  const [dueTouched, setDueTouched] = useState(false);
  const [collectedInput, setCollectedInput] = useState("");
  const [collectedTouched, setCollectedTouched] = useState(false);
  // Self-pay discount (e.g. a 50% Adventist discount). Applies to upfront/self-pay
  // only; the discounted total is what's logged and drives every calculation.
  const [discountPct, setDiscountPct] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const resetCopay = () => { setDueTouched(false); setCollectedTouched(false); setDueInput(""); setCollectedInput(""); setDiscountPct(""); setDiscountReason(""); };
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const insurer = useMemo(() => insurers.find((i) => i.id === insurerId), [insurers, insurerId]);
  const totalCost = useMemo(() => round2(codes.reduce((t, c) => t + (cptCodes.find((x) => x.code === c)?.fee || 0), 0)), [codes, cptCodes]);
  const duration = useMemo(() => round2(codes.reduce((t, c) => t + (cptCodes.find((x) => x.code === c)?.hrs || 0), 0)), [codes, cptCodes]);
  const suggested = suggestCopay(insurer, totalCost);
  const copayDue = round2(dueTouched ? Number(dueInput) || 0 : suggested);
  const copayCollected = round2(collectedTouched ? Number(collectedInput) || 0 : copayDue);
  const uncollected = Math.max(0, round2(copayDue - copayCollected));
  // Discount applies to self-pay only; the charged total is the fee less the discount.
  const discPct = payMode === "upfront" ? Math.min(100, Math.max(0, Number(discountPct) || 0)) : 0;
  const chargedTotal = discPct > 0 ? round2(totalCost * (1 - discPct / 100)) : totalCost;
  const collectedAtVisit = insurerId ? copayCollected : chargedTotal;
  const billedToInsurance = insurerId ? Math.max(0, round2(totalCost - copayDue)) : 0;

  const toggle = (code: string) => { setCodes((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code])); resetCopay(); };

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
        body: JSON.stringify({ clientFirst: first.trim(), clientLast: last.trim(), clientId: mode === "returning" ? pickedId : null, dob: mode === "new" && dob ? dob : null, insurerId: insurerId || null, dateOfService: dos, cptCodes: codes, durationHours: duration, totalCost: chargedTotal, copayCollected: payMode === "insurance" ? copayCollected : 0, copayDue: payMode === "insurance" ? copayDue : 0, notes: finalNotes, ...(forId ? { clinicianId: forId } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the session.");
      if (andAnother) {
        // A clinician logging a day's work does several in a row, so keep the
        // date and clear only what changes from one client to the next.
        setSaved(`Logged ${first.trim()} ${last.trim()} — ${money(totalCost)}.`);
        setPicked(""); setPickedId(null); setPickedReferralEnd(null); setFirst(""); setLast(""); setDob(""); setInsurerId(""); setPayMode("upfront");
        setCodes([]); resetCopay(); setNotes(""); setSearch("");
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
  const otherCodes = useMemo(() => {
    const q = codeSearch.trim().toLowerCase();
    const rest = cptCodes.filter((c) => !usualCodes.includes(c.code));
    if (!q) return rest;
    return rest.filter((c) => c.code.includes(q) || c.description.toLowerCase().includes(q));
  }, [cptCodes, usualCodes, codeSearch]);

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
                <input type="date" className="ls-in" style={{ maxWidth: 190 }} value={dob} onChange={(e) => setDob(e.target.value)} max={today || undefined} />
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
            <p className="ls-help" style={{ marginTop: 0 }}>Tap a code to add it. Tap a highlighted code again — or its <b>×</b> below — to remove it.</p>
            {codes.length > 0 && (
              <div className="ls-selcodes">
                {codes.map((code) => { const c = cptCodes.find((x) => x.code === code); return (
                  <button type="button" key={code} className="ls-selchip" onClick={() => toggle(code)} title="Remove this code">
                    <span>{code}{c ? ` · ${money(c.fee)}` : ""}</span><span className="x">×</span>
                  </button>
                ); })}
              </div>
            )}
            {usual.length > 0 && (
              <>
                <p className="ls-codelab">The ones you use most</p>
                <div className="ls-cptlist">
                  {usual.map((c) => (
                    <button type="button" key={c.code} className={`ls-code ${codes.includes(c.code) ? "on" : ""}`} onClick={() => toggle(c.code)}>
                      <span className="cd">{c.code}</span>
                      <span className="ds">{c.description || "—"}</span>
                      <span className="fe">{money(c.fee)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {!showAllCodes ? (
              <button type="button" className="ls-more" onClick={() => setShowAllCodes(true)}>
                {usual.length > 0 ? `Another code (${otherCodes.length} more)` : `Choose a code (${otherCodes.length})`}
              </button>
            ) : (
              <>
                <input
                  className="ls-in" value={codeSearch} onChange={(e) => setCodeSearch(e.target.value)}
                  placeholder="Search by code or description…" aria-label="Search service codes"
                  style={{ margin: "10px 0" }}
                />
                <div className="ls-cptlist tall">
                  {otherCodes.length === 0 ? (
                    <p className="ls-none">No code matches &ldquo;{codeSearch}&rdquo;.</p>
                  ) : otherCodes.map((c) => (
                    <button type="button" key={c.code} className={`ls-code ${codes.includes(c.code) ? "on" : ""}`} onClick={() => toggle(c.code)}>
                      <span className="cd">{c.code}</span>
                      <span className="ds">{c.description || "—"}</span>
                      <span className="fe">{money(c.fee)}</span>
                    </button>
                  ))}
                </div>
                <button type="button" className="ls-more" onClick={() => { setShowAllCodes(false); setCodeSearch(""); }}>Hide the full list</button>
              </>
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
          {payMode === "insurance" && (
          <div className="ls-field">
            <label className="ls-q">Co-pay <span className="opt">what&apos;s due vs what you collected</span></label>
            <div className="ls-row2">
              <div style={{ flex: 1 }}>
                <span className="ls-sublab">Due</span>
                <div className="ls-money"><span className="cur">$</span><input className="ls-in" type="number" step="0.01" min="0" value={dueTouched ? dueInput : (suggested ? String(suggested) : "0")} onChange={(e) => { setDueTouched(true); setDueInput(e.target.value); if (!collectedTouched) { setCollectedTouched(true); setCollectedInput(e.target.value); } }} /></div>
              </div>
              <div style={{ flex: 1 }}>
                <span className="ls-sublab">Collected</span>
                <div className="ls-money"><span className="cur">$</span><input className="ls-in" type="number" step="0.01" min="0" value={collectedTouched ? collectedInput : String(copayDue)} onChange={(e) => { setCollectedTouched(true); setCollectedInput(e.target.value); }} /></div>
              </div>
              <button type="button" className="ls-writeoff" onClick={() => { setDueTouched(true); setDueInput("0"); setCollectedTouched(true); setCollectedInput("0"); }}>Waive</button>
              <button type="button" className="ls-writeoff" onClick={() => { setCollectedTouched(true); setCollectedInput("0"); }}>Not collected</button>
            </div>
            {uncollected > 0 && (
              <p className="ls-uncollected">⚠ {money(uncollected)} co-pay not collected — recorded as a write-off. It counts toward your monthly uncollected total.</p>
            )}
            {insurerId && uncollected === 0 && !dueTouched && suggested > 0 && (
              <p className="ls-help">Co-pay due auto-filled from <b>{insurer?.name}</b>. Change &ldquo;Due&rdquo; if this client&apos;s plan differs; lower &ldquo;Collected&rdquo; (or tap <b>Not collected</b>) if you didn&apos;t take it.</p>
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
          <div className="ls-status self"><span className="ic">✓</span><span>Self-pay — the full {money(totalCost)} is collected at the visit, nothing goes to insurance.</span></div>
        )}
      </div>
    </form>
  );
}
