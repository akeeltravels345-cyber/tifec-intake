"use client";

import { useState } from "react";
import type { ClinicianExpense } from "@/lib/clinicianExpenses";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const rid = () => Math.random().toString(36).slice(2, 10);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Local-time label for a just-saved timestamp (post-interaction, no SSR concern).
function fmtSavedLocal(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  let h = d.getHours(); const m = d.getMinutes();
  const ap = h < 12 ? "am" : "pm"; h = h % 12 || 12;
  return `${d.getDate()} ${MON[d.getMonth()]}, ${h}:${String(m).padStart(2, "0")} ${ap}`;
}

export default function MyExpenses({
  monthKey, monthLabel, initial, source, from, netPayout, savedLabel = "",
}: {
  monthKey: string;
  monthLabel: string;       // e.g. "July 2026"
  initial: ClinicianExpense[];
  source: "month" | "carried" | "base";
  from?: string;            // "YYYY-MM" a carried draft came from
  netPayout: number;
  savedLabel?: string;      // pre-formatted "1 Jul, 4:02 pm" for a saved month
}) {
  const monthShort = monthLabel.split(" ")[0];
  const fromLabel = from ? `${MON[Math.max(0, Number(from.slice(5, 7)) - 1)]} ${from.slice(0, 4)}` : "";
  const [rows, setRows] = useState<ClinicianExpense[]>(initial);
  // Saved months open as a read view; a carried draft (or an empty base month)
  // opens editable. A carried draft is dirty on arrival so Save is live.
  const [editing, setEditing] = useState(source !== "month");
  const [dirty, setDirty] = useState(source === "carried");
  const [savedAtLabel, setSavedAtLabel] = useState(savedLabel);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const total = Math.round(rows.reduce((t, e) => t + (Number(e.amount) || 0), 0) * 100) / 100;
  const takeHome = Math.round((netPayout - total) * 100) / 100;
  const running = rows.filter((e) => e.kind === "running");
  const oneoff = rows.filter((e) => e.kind === "oneoff");

  const touch = () => { setDirty(true); setMsg(""); };
  const update = (id: string, patch: Partial<ClinicianExpense>) => { setRows((r) => r.map((e) => (e.id === id ? { ...e, ...patch } : e))); touch(); };
  const add = (kind: ClinicianExpense["kind"]) => { setRows((r) => [...r, { id: rid(), name: "", amount: 0, kind }]); touch(); };
  const remove = (id: string) => { setRows((r) => r.filter((e) => e.id !== id)); touch(); };
  const flip = (id: string) => update(id, { kind: rows.find((e) => e.id === id)?.kind === "running" ? "oneoff" : "running" });

  async function save() {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/billing/clinician-expenses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: monthKey, expenses: rows }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not save.");
      setRows(j.expenses); setDirty(false); setEditing(false);
      setSavedAtLabel(j.savedAt ? fmtSavedLocal(j.savedAt) : savedAtLabel);
      setMsg("Saved.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not save."); }
    finally { setBusy(false); }
  }
  function cancel() { setRows(initial); setDirty(false); setEditing(false); setMsg(""); }

  // ---- row renderers ----
  const editRow = (e: ClinicianExpense) => (
    <div key={e.id} className="exp-erow">
      <input className="ls-in" value={e.name} placeholder="e.g. Office rent, CPD course" onChange={(ev) => update(e.id, { name: ev.target.value })} />
      <div className="ls-money" style={{ width: 130 }}><span className="cur">$</span><input className="ls-in" type="number" step="0.01" min="0" style={{ textAlign: "right" }} value={e.amount || ""} placeholder="0.00" onChange={(ev) => update(e.id, { amount: Number(ev.target.value) || 0 })} /></div>
      <button type="button" className="exp-flip" onClick={() => flip(e.id)} title="Change whether this carries forward">{e.kind === "running" ? "Make one-off" : "Make running"}</button>
      <button type="button" className="cd-xbtn" title="Remove" onClick={() => remove(e.id)}>×</button>
    </div>
  );
  const readRow = (e: ClinicianExpense) => (
    <div key={e.id} className="exp-leader"><span className="exp-lname">{e.name || "—"}</span><span className="exp-dots" /><span className="exp-lamt">{money(e.amount)}</span></div>
  );

  const group = (kind: ClinicianExpense["kind"], list: ClinicianExpense[]) => {
    const label = kind === "running" ? "Running" : "One-off";
    const sub = kind === "running" ? "carries forward to next month" : `${monthShort} only`;
    return (
      <div className="exp-group" key={kind}>
        <div className="exp-ghead"><span className="exp-glab">{label}</span><span className="exp-gsub">· {sub}</span></div>
        {list.length === 0 ? (
          editing ? <p className="su-hint" style={{ margin: "2px 2px 8px" }}>None yet.</p> : null
        ) : (
          <div className="exp-rows">{list.map((e) => (editing ? editRow(e) : readRow(e)))}</div>
        )}
        {editing && <button type="button" className="su-add" onClick={() => add(kind)}>+ Add {label.toLowerCase()} expense</button>}
      </div>
    );
  };

  return (
    <div className="su-sec">
      <div className="exp-card">
        {/* Header: take-home is the headline figure. */}
        <div className="exp-top">
          <div>
            <div className="exp-title">My expenses</div>
            <div className="su-hint">{monthLabel} · private to you — never on your payout statement or shown to the practice.</div>
          </div>
          <div className="exp-takehome">
            <span className="exp-thlab">Take-home</span>
            <span className="exp-thfig">{money(takeHome)}</span>
            <span className="exp-thsub">{money(netPayout)} payout − {money(total)} expenses</span>
          </div>
        </div>

        {editing && source === "carried" && (
          <div className="exp-note">These are last month&apos;s running costs, carried forward from {fromLabel}. Edit the amounts, add {monthShort}&apos;s one-offs, then save. Nothing is recorded for {monthLabel} until you do.</div>
        )}

        {!editing && running.length === 0 && oneoff.length === 0 ? (
          <p className="su-hint" style={{ margin: "6px 2px" }}>No expenses recorded for {monthLabel}.</p>
        ) : (
          <div className="exp-groups">
            {group("running", running)}
            {group("oneoff", oneoff)}
          </div>
        )}

        <div className="exp-foot">
          {editing ? (
            <>
              <button type="button" className="ls-save" disabled={busy || (!dirty && source === "month")} onClick={save}>
                {busy ? "Saving…" : source === "carried" ? `Save ${monthShort}'s expenses` : "Save changes"}
              </button>
              {source === "month" && <button type="button" className="su-del" disabled={busy} onClick={cancel}>Cancel</button>}
              {msg && <span className="su-hint">{msg}</span>}
            </>
          ) : (
            <>
              <span className="su-hint">{savedAtLabel ? `Saved ${savedAtLabel}` : "Saved"}</span>
              <div style={{ flex: 1 }} />
              <button type="button" className="su-add" onClick={() => setEditing(true)}>Edit expenses</button>
              {msg && <span className="su-hint">{msg}</span>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
