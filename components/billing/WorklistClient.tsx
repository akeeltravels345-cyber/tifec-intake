"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface FeatureRow {
  id: string;
  name: string;
  description: string;
  flow: string;
  priority: "nice" | "important" | "urgent";
  by: string;
  at: string;
}

const PRI_LABEL: Record<string, string> = { urgent: "Urgent", important: "Important", nice: "Nice to have" };

export default function WorklistClient({ rows }: { rows: FeatureRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [flowStart, setFlowStart] = useState("");
  const [flowEnd, setFlowEnd] = useState("");
  const [priority, setPriority] = useState("nice");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!name.trim()) { setError("Give the feature a name."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/billing/worklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, flowStart, flowEnd, priority }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not save.");
      setName(""); setDescription(""); setFlowStart(""); setFlowEnd(""); setPriority("nice");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="su-topbar">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 className="su-h1">Worklist</h1>
            <p className="su-sub">Features you and Nick want built — name, what it does, and the flow (where it starts → where it ends).</p>
          </div>
          <button type="button" className="wl-add" onClick={() => setOpen((o) => !o)}>{open ? "Close" : "+ Add a feature"}</button>
        </div>
      </div>

      {open && (
        <div className="wl-form">
          <label className="wl-lab">Feature name
            <input className="ls-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bulk mark self-pay balances paid" autoFocus />
          </label>
          <label className="wl-lab">What it does <span className="opt">plain words — what you want and why</span>
            <textarea className="ls-in" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the feature and how you'd use it…" />
          </label>
          <div className="wl-flow">
            <label className="wl-lab">Where it starts
              <input className="ls-in" value={flowStart} onChange={(e) => setFlowStart(e.target.value)} placeholder="e.g. Owed by clients → tick several" />
            </label>
            <span className="wl-arrow" aria-hidden="true">→</span>
            <label className="wl-lab">Where it ends
              <input className="ls-in" value={flowEnd} onChange={(e) => setFlowEnd(e.target.value)} placeholder="e.g. all marked paid on one date" />
            </label>
          </div>
          <label className="wl-lab">Priority
            <select className="ls-in" value={priority} onChange={(e) => setPriority(e.target.value)} style={{ maxWidth: 220 }}>
              <option value="nice">Nice to have</option>
              <option value="important">Important</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
          {error && <div className="ls-err">{error}</div>}
          <div className="wl-acts">
            <button type="button" className="ls-save sm" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Add to worklist"}</button>
            <button type="button" className="su-del sm" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bq-empty" style={{ padding: 28 }}>
          <div className="big">No features yet</div>
          <div className="small">Add the first one — or send it to Nick to add what he needs.</div>
        </div>
      ) : (
        <div className="wl-list">
          {rows.map((f) => (
            <div className="wl-card" key={f.id}>
              <div className="wl-head">
                <span className="wl-name">{f.name}</span>
                <span className={`wl-pri ${f.priority}`}>{PRI_LABEL[f.priority]}</span>
              </div>
              {f.description && <p className="wl-desc">{f.description}</p>}
              {f.flow && <div className="wl-flowline"><span className="wl-flag">Flow</span>{f.flow}</div>}
              <div className="wl-meta">Requested by {f.by} · {f.at}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
