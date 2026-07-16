"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface InsurerOpt { id: string; name: string; copayType: "none" | "fixed" | "percentage"; copayRate: number; }
interface CptOpt { code: string; description: string; fee: number; hrs: number; }
interface ClientOpt { first: string; last: string; insurerId: string | null; lastVisit: string; }
const clientKey = (f: string, l: string) => `${f}|${l}`.toLowerCase().trim();

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
function suggestCopay(ins: InsurerOpt | undefined, total: number): number {
  if (!ins) return 0;
  if (ins.copayType === "fixed") return round2(ins.copayRate);
  if (ins.copayType === "percentage") return round2((total * ins.copayRate) / 100);
  return 0;
}

export default function SessionForm({ insurers, cptCodes, clients = [] }: { insurers: InsurerOpt[]; cptCodes: CptOpt[]; clients?: ClientOpt[] }) {
  const router = useRouter();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [picked, setPicked] = useState("");

  function pickClient(c: ClientOpt) {
    const k = clientKey(c.first, c.last);
    if (picked === k) { setPicked(""); setFirst(""); setLast(""); setInsurerId(""); setCopayTouched(false); return; }
    setPicked(k); setFirst(c.first); setLast(c.last); setInsurerId(c.insurerId || ""); setCopayTouched(false);
  }
  const [dos, setDos] = useState("");
  const [insurerId, setInsurerId] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [copay, setCopay] = useState("");
  const [copayTouched, setCopayTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const insurer = useMemo(() => insurers.find((i) => i.id === insurerId), [insurers, insurerId]);
  const totalCost = useMemo(() => round2(codes.reduce((t, c) => t + (cptCodes.find((x) => x.code === c)?.fee || 0), 0)), [codes, cptCodes]);
  const duration = useMemo(() => round2(codes.reduce((t, c) => t + (cptCodes.find((x) => x.code === c)?.hrs || 0), 0)), [codes, cptCodes]);
  const suggested = suggestCopay(insurer, totalCost);
  const copayValue = copayTouched ? copay : suggested ? String(suggested) : "0";
  const copayNum = Number(copayValue) || 0;
  const collectedAtVisit = insurerId ? copayNum : totalCost;
  const billedToInsurance = insurerId ? Math.max(0, round2(totalCost - copayNum)) : 0;

  const toggle = (code: string) => { setCodes((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code])); setCopayTouched(false); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!first.trim() || !last.trim()) return setError("Client first and last name are required.");
    if (!dos) return setError("Date of service is required.");
    if (!codes.length) return setError("Select at least one service code.");
    setBusy(true);
    try {
      const res = await fetch("/api/billing/sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientFirst: first.trim(), clientLast: last.trim(), insurerId: insurerId || null, dateOfService: dos, cptCodes: codes, durationHours: duration, totalCost, copayCollected: copayNum, notes: notes.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the session.");
      router.push("/billing/me");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

  return (
    <form onSubmit={submit} className="ls-grid">
      <div className="ls-card">
        <div className="ls-form">
          {clients.length > 0 && (
            <div className="ls-field">
              <label className="ls-q">Returning client? <span className="opt">tap to log another visit</span></label>
              <div className="ls-clients">
                {clients.map((c) => {
                  const k = clientKey(c.first, c.last);
                  return <button type="button" key={k} className={`ls-client ${picked === k ? "on" : ""}`} onClick={() => pickClient(c)}>{c.first} {c.last}</button>;
                })}
              </div>
            </div>
          )}
          <div className="ls-field">
            <label className="ls-q">Client name <span className="ls-req">*</span></label>
            <div className="ls-row2">
              <input className="ls-in" placeholder="First" value={first} onChange={(e) => { setFirst(e.target.value); setPicked(""); }} />
              <input className="ls-in" placeholder="Last" value={last} onChange={(e) => { setLast(e.target.value); setPicked(""); }} />
            </div>
          </div>
          <div className="ls-field">
            <label className="ls-q">Date of service <span className="ls-req">*</span></label>
            <input type="date" className="ls-in" style={{ maxWidth: 220 }} value={dos} onChange={(e) => setDos(e.target.value)} />
          </div>
          <div className="ls-field">
            <label className="ls-q">Insurance provider</label>
            <select className="ls-sel" value={insurerId} onChange={(e) => { setInsurerId(e.target.value); setCopayTouched(false); }}>
              <option value="">Self-pay / none</option>
              {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div className="ls-field">
            <label className="ls-q">Service code(s) <span className="ls-req">*</span></label>
            <div className="ls-cpt">
              {cptCodes.map((c) => (
                <button type="button" key={c.code} className={`ls-chip ${codes.includes(c.code) ? "on" : ""}`} onClick={() => toggle(c.code)} title={c.description}>
                  {c.code}<small>{money(c.fee)}</small>
                </button>
              ))}
            </div>
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
          <div className="ls-field">
            <label className="ls-q">Co-pay collected at visit <span className="opt">adjust to the client&apos;s plan</span></label>
            <div className="ls-money"><span className="cur">$</span><input className="ls-in" type="number" step="0.01" min="0" value={copayValue} onChange={(e) => { setCopayTouched(true); setCopay(e.target.value); }} /></div>
            {insurerId && (
              <p className="ls-help">
                {!copayTouched && suggested > 0
                  ? <>Auto-filled from <b>{insurer?.name}</b> ({insurer?.copayType === "percentage" ? `${insurer?.copayRate}%` : money(insurer?.copayRate ?? 0)}) — plans vary, so change it to what this client actually pays.</>
                  : <>Plans vary from the default — enter what this client actually pays.</>}
              </p>
            )}
          </div>
          <div className="ls-field">
            <label className="ls-q">Notes <span className="opt">optional</span></label>
            <textarea className="ls-in" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <div className="ls-err">{error}</div>}
          <button type="submit" className="ls-save" disabled={busy}>{busy ? "Saving…" : "Save session"}</button>
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
