"use client";

import { useState } from "react";
import type { ClinicianExpense } from "@/lib/clinicianExpenses";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const rid = () => Math.random().toString(36).slice(2, 10);

export default function MyExpenses({
  monthKey, monthLabel, initial, source, from, netPayout,
}: {
  monthKey: string;
  monthLabel: string;
  initial: ClinicianExpense[];
  source: "month" | "carried" | "base";
  from?: string;
  netPayout: number;
}) {
  const [rows, setRows] = useState<ClinicianExpense[]>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [dirty, setDirty] = useState(source === "carried");

  const total = Math.round(rows.reduce((t, e) => t + (Number(e.amount) || 0), 0) * 100) / 100;
  const takeHome = Math.round((netPayout - total) * 100) / 100;

  const update = (id: string, patch: Partial<ClinicianExpense>) => {
    setRows((r) => r.map((e) => (e.id === id ? { ...e, ...patch } : e))); setDirty(true); setMsg("");
  };
  const add = (kind: ClinicianExpense["kind"]) => { setRows((r) => [...r, { id: rid(), name: "", amount: 0, kind }]); setDirty(true); setMsg(""); };
  const remove = (id: string) => { setRows((r) => r.filter((e) => e.id !== id)); setDirty(true); setMsg(""); };

  async function save() {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/billing/clinician-expenses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: monthKey, expenses: rows }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not save.");
      setRows(j.expenses); setDirty(false); setMsg("Saved.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not save."); }
    finally { setBusy(false); }
  }

  return (
    <div className="su-sec">
      <div className="su-sechead">
        <h2 className="su-sech">My expenses · {monthLabel}</h2>
        <span className="su-hint">Private to you. Track your own running and one-off costs for the month. These are never shown on your payout statement or to the practice.</span>
      </div>
      <div className="su-card" style={{ padding: 16 }}>
        {source === "carried" && (
          <p className="su-hint" style={{ margin: "0 0 12px" }}>Carried forward from {from} (running items only). Edit the amounts, add this month&apos;s one-offs, and save.</p>
        )}

        {rows.length === 0 ? (
          <p className="su-hint" style={{ margin: "0 0 12px" }}>No expenses recorded for this month yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 120px 34px", gap: 10, fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--faint, #9aa2b1)", padding: "0 2px" }}>
              <span>Expense</span><span>Type</span><span style={{ textAlign: "right" }}>Amount (KYD)</span><span />
            </div>
            {rows.map((e) => (
              <div key={e.id} style={{ display: "grid", gridTemplateColumns: "1fr 130px 120px 34px", gap: 10, alignItems: "center" }}>
                <input className="ls-in" value={e.name} placeholder="e.g. Office rent, CPD course" onChange={(ev) => update(e.id, { name: ev.target.value })} />
                <select className="ls-in" value={e.kind} onChange={(ev) => update(e.id, { kind: ev.target.value as ClinicianExpense["kind"] })}>
                  <option value="running">Running</option>
                  <option value="oneoff">One-off</option>
                </select>
                <input className="ls-in" type="number" step="0.01" min="0" style={{ textAlign: "right" }} value={e.amount || ""} placeholder="0.00" onChange={(ev) => update(e.id, { amount: Number(ev.target.value) || 0 })} />
                <button type="button" className="cd-xbtn" title="Remove" onClick={() => remove(e.id)}>×</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <button type="button" className="su-add" onClick={() => add("running")}>+ Running expense</button>
          <button type="button" className="su-add" onClick={() => add("oneoff")}>+ One-off expense</button>
        </div>

        <div style={{ borderTop: "1px solid var(--hair, #ece7dc)", paddingTop: 12, display: "grid", gap: 6, fontSize: 14, maxWidth: 380, marginLeft: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted, #5c636e)" }}><span>My expenses this month</span><span>{money(total)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted, #5c636e)" }}><span>Net payout (from the practice)</span><span>{money(netPayout)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, borderTop: "1px solid var(--hair, #ece7dc)", paddingTop: 8, color: takeHome < 0 ? "var(--red, #9a3b2a)" : "var(--ink, #1c2330)" }}>
            <span>Take-home after my expenses</span><span>{money(takeHome)}</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
          <button type="button" className="ls-save" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : dirty ? "Save my expenses" : "Saved"}</button>
          {msg && <span className="su-hint">{msg}</span>}
        </div>
      </div>
    </div>
  );
}
