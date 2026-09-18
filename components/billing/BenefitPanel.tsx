"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface BenefitSummary { amount: number; year: number; used: number; remaining: number; }
const money = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// A client's total insurance funds for a plan year. Each insured date of service
// draws it down by the amount billed to the insurer; the remaining balance is
// computed from the sessions (passed in), so this panel only sets the total.
export default function BenefitPanel({ clientId, benefit, today, canEdit }: {
  clientId: string;
  benefit: BenefitSummary | null;
  today: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const thisYear = String(Number(today.slice(0, 4)));
  const [edit, setEdit] = useState(false);
  const [amt, setAmt] = useState(benefit ? String(benefit.amount) : "");
  const [year, setYear] = useState(benefit ? String(benefit.year) : thisYear);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/billing/clients/${clientId}/benefit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amt) || 0, year: Number(year) || Number(thisYear) }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Could not save."); return; }
      setEdit(false);
      router.refresh(); // the record recomputes remaining from the sessions
    } catch { setErr("Could not reach the server."); }
    finally { setBusy(false); }
  }

  const out = benefit && benefit.remaining <= 0;

  return (
    <div className="ded">
      <div className="ded-head">
        <div>
          <span className="ded-lab">Total insurance funds</span>
          <span className="ded-amt">{benefit ? money(benefit.amount) : "None set"}{benefit ? <span className="ded-year"> · {benefit.year}</span> : null}</span>
        </div>
        {canEdit && !edit && (
          <button type="button" className="ded-link" onClick={() => { setEdit(true); setAmt(benefit ? String(benefit.amount) : ""); setYear(benefit ? String(benefit.year) : thisYear); }}>
            {benefit ? "Change" : "Set funds"}
          </button>
        )}
      </div>

      {edit && (
        <div className="ded-editrow">
          <label>Total amount (set by insurer)<input type="number" step="0.01" min="0" className="ls-in" value={amt} placeholder="0.00" onChange={(e) => setAmt(e.target.value)} /></label>
          <label>Plan year<input type="number" className="ls-in" style={{ maxWidth: 110 }} value={year} onChange={(e) => setYear(e.target.value)} /></label>
          <button type="button" className="ls-save sm" disabled={busy} onClick={save}>Save</button>
          <button type="button" className="su-del sm" onClick={() => setEdit(false)}>Cancel</button>
        </div>
      )}

      {benefit && (
        <>
          <div className="ded-stats">
            <div className="ded-stat"><span className="k">Total funds</span><span className="v">{money(benefit.amount)}</span></div>
            <div className="ded-stat"><span className="k">Used ({benefit.year})</span><span className="v">{money(benefit.used)}</span></div>
            <div className={`ded-stat ${out ? "out" : "hl"}`}><span className="k">Remaining</span><span className="v">{money(benefit.remaining)}</span></div>
          </div>
          {out
            ? <p className="ded-hint" style={{ color: "var(--bad, #bd3a29)", fontWeight: 600 }}>⚠ Funds used up for {benefit.year}. New insured charges will exceed the client&apos;s available funds.</p>
            : <p className="ded-hint">Each insured date of service draws this down by the amount billed to the insurer. Co-pays and self-pay visits don&apos;t count.</p>}
        </>
      )}

      {err && <p className="ded-err">{err}</p>}
      {!benefit && <p className="ded-hint">Set the total funds the insurer has authorised for this client&apos;s plan year. Insured visits count down against it.</p>}
    </div>
  );
}
