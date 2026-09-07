"use client";

import { useState } from "react";
import type { ClientDeductible, DeductibleApplied } from "@/lib/clients";

interface Summary { amount: number; applied: number; met: number; remaining: number; }
interface SessionOpt { id: string; date: string; total: number; }
const money = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// A client's insurance deductible: a figure the insurer sets that counts DOWN as
// the patient pays out of pocket for sessions. Each session drawn down comes off
// the balance until it reaches zero; then everything runs through insurance.
export default function DeductiblePanel({ clientId, deductible, applied, summary, sessions, today, canEdit }: {
  clientId: string;
  deductible: ClientDeductible | null;
  applied: DeductibleApplied[];
  summary: Summary;
  sessions: SessionOpt[];
  today: string;
  canEdit: boolean;
}) {
  const [ded, setDed] = useState(deductible);
  const [rows, setRows] = useState(applied);
  const [sum, setSum] = useState(summary);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [editAmt, setEditAmt] = useState(false);
  const [amtInput, setAmtInput] = useState(deductible ? String(deductible.amount) : "");
  const [yearInput, setYearInput] = useState(deductible ? String(deductible.year) : String(Number(today.slice(0, 4))));

  // Apply-a-session form
  const [addOpen, setAddOpen] = useState(false);
  const [pickId, setPickId] = useState("");
  const [applyDate, setApplyDate] = useState(today);
  const [applyAmt, setApplyAmt] = useState("");

  // Sessions not yet drawn down (so the same one isn't applied twice).
  const usedIds = new Set(rows.map((r) => r.sessionId).filter(Boolean));
  const available = sessions.filter((s) => !usedIds.has(s.id));

  async function post(body: Record<string, unknown>) {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/billing/clients/${clientId}/deductible`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Could not save."); return false; }
      setDed(data.deductible); setRows(data.applied); setSum(data.summary);
      return true;
    } catch { setErr("Could not reach the server."); return false; }
    finally { setBusy(false); }
  }

  async function saveAmount() {
    const amount = Number(amtInput) || 0;
    const year = Number(yearInput) || Number(today.slice(0, 4));
    if (await post({ action: "set-amount", amount, year })) setEditAmt(false);
  }

  function pickSession(sid: string) {
    setPickId(sid);
    const s = sessions.find((x) => x.id === sid);
    if (s) { setApplyDate(s.date); setApplyAmt(String(Math.min(s.total, sum.remaining))); }
  }

  async function applyNow() {
    const amount = Number(applyAmt) || 0;
    if (amount <= 0) { setErr("Enter an amount to apply."); return; }
    if (await post({ action: "apply", sessionId: pickId || null, date: applyDate, amount })) {
      setAddOpen(false); setPickId(""); setApplyAmt(""); setApplyDate(today);
    }
  }

  // Running balance down the applied list, oldest first.
  const ordered = [...rows].sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id));
  let run = sum.amount;
  const ledger = ordered.map((r) => { run = Math.max(0, Math.round((run - r.amount) * 100) / 100); return { r, after: run }; });

  return (
    <div className="ded">
      <div className="ded-head">
        <div>
          <span className="ded-lab">Insurance deductible</span>
          <span className="ded-amt">{ded ? money(ded.amount) : "None set"}{ded ? <span className="ded-year"> · {ded.year}</span> : null}</span>
        </div>
        {canEdit && !editAmt && (
          <button type="button" className="ded-link" onClick={() => { setEditAmt(true); setAmtInput(ded ? String(ded.amount) : ""); setYearInput(ded ? String(ded.year) : String(Number(today.slice(0, 4)))); }}>
            {ded ? "Change" : "Set deductible"}
          </button>
        )}
      </div>

      {editAmt && (
        <div className="ded-editrow">
          <label>Amount (set by insurer)<input type="number" step="0.01" min="0" className="ls-in" value={amtInput} placeholder="0.00" onChange={(e) => setAmtInput(e.target.value)} /></label>
          <label>Plan year<input type="number" className="ls-in" style={{ maxWidth: 110 }} value={yearInput} onChange={(e) => setYearInput(e.target.value)} /></label>
          <button type="button" className="ls-save sm" disabled={busy} onClick={saveAmount}>Save</button>
          <button type="button" className="su-del sm" onClick={() => setEditAmt(false)}>Cancel</button>
        </div>
      )}

      {ded && (
        <>
          <div className="ded-stats">
            <div className="ded-stat"><span className="k">Deductible</span><span className="v">{money(sum.amount)}</span></div>
            <div className="ded-stat"><span className="k">Met so far</span><span className="v">{money(sum.met)}</span></div>
            <div className={`ded-stat ${sum.remaining === 0 ? "done" : "hl"}`}><span className="k">Remaining</span><span className="v">{money(sum.remaining)}</span></div>
          </div>

          <div className="ded-paylist-head">
            <span>Sessions applied to the deductible</span>
            {canEdit && sum.remaining > 0 && !addOpen && available.length + sessions.length >= 0 && (
              <button type="button" className="ded-link" onClick={() => { setAddOpen(true); setPickId(""); setApplyAmt(""); setApplyDate(today); }}>+ Apply a session</button>
            )}
          </div>

          {addOpen && (
            <div className="ded-addpay">
              <label>Session<select className="ls-in" value={pickId} onChange={(e) => pickSession(e.target.value)}>
                <option value="">— pick a charge —</option>
                {available.map((s) => <option key={s.id} value={s.id}>{s.date} · {money(s.total)}</option>)}
              </select></label>
              <label>Date<input type="date" className="ls-in" value={applyDate} max={today} onChange={(e) => setApplyDate(e.target.value)} /></label>
              <label>Amount applied<input type="number" step="0.01" min="0" className="ls-in" value={applyAmt} placeholder="0.00" onChange={(e) => setApplyAmt(e.target.value)} /></label>
              <button type="button" className="ls-save sm" disabled={busy} onClick={applyNow}>Apply</button>
              <button type="button" className="su-del sm" onClick={() => setAddOpen(false)}>Cancel</button>
            </div>
          )}
          {addOpen && <p className="ded-hint" style={{ margin: "0 0 10px" }}>Only {money(sum.remaining)} of the deductible is left, so at most that much can be applied — the rest of the session runs through insurance.</p>}

          {ledger.length === 0 ? (
            <p className="ded-empty">No sessions applied yet. As the patient pays out of pocket, apply each session to draw the deductible down.</p>
          ) : (
            <ul className="ded-paylist">
              {ledger.map(({ r, after }) => (
                <li key={r.id}>
                  <span className="amt">−{money(r.amount)}</span>
                  <span className="date">{r.date}</span>
                  <span className="meth">deductible now {money(after)}{r.note ? ` · ${r.note}` : ""}</span>
                  {canEdit && <button type="button" className="ded-x" title="Undo this draw-down" disabled={busy} onClick={() => post({ action: "remove", entryId: r.id })}>×</button>}
                </li>
              ))}
            </ul>
          )}

          {sum.remaining === 0 && <p className="ded-hint" style={{ color: "#2c7a55" }}>✓ Deductible fully met. Sessions from here run through insurance as normal.</p>}
        </>
      )}

      {err && <p className="ded-err">{err}</p>}
      {!ded && <p className="ded-hint">Set the deductible the insurer has on file. It counts down as the patient pays out of pocket for their sessions.</p>}
    </div>
  );
}
