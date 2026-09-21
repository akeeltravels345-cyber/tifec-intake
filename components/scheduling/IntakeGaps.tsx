"use client";

import { useState } from "react";

interface Row {
  id: string; clientName: string; serviceName: string; clinicianName: string;
  whenText: string; soon: boolean; missingLabels: string[]; reminderSentAt: string | null; hasEmail: boolean;
}

export default function IntakeGaps({ rows, showClinician }: { rows: Row[]; showClinician: boolean }) {
  const [state, setState] = useState<Record<string, { busy?: boolean; done?: string; err?: string }>>({});

  async function remind(id: string) {
    setState((s) => ({ ...s, [id]: { busy: true } }));
    try {
      const res = await fetch("/api/scheduling/intake-reminder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) setState((s) => ({ ...s, [id]: { done: data.result === "received" ? "Already completed" : "Reminder sent" } }));
      else if (data.result === "no_email") setState((s) => ({ ...s, [id]: { err: "No email on file" } }));
      else setState((s) => ({ ...s, [id]: { err: "Could not send" } }));
    } catch { setState((s) => ({ ...s, [id]: { err: "Could not send" } })); }
  }

  if (rows.length === 0) {
    return <p className="sr-empty">Everyone with an upcoming appointment has their intake in. Nothing to chase.</p>;
  }

  return (
    <div className="ig-list">
      {rows.map((r) => {
        const st = state[r.id] || {};
        return (
          <div key={r.id} className={`ig-row${r.soon ? " soon" : ""}`}>
            <div className="ig-main">
              <div className="ig-top">
                <span className="ig-name">{r.clientName}</span>
                {r.soon && <span className="ig-soon">Within 48h</span>}
              </div>
              <div className="ig-meta">
                {r.serviceName}{showClinician && r.clinicianName ? ` · ${r.clinicianName}` : ""} · {r.whenText}
              </div>
              <div className="ig-forms">
                {r.missingLabels.map((f) => <span key={f} className="ig-chip">{f}</span>)}
                {r.reminderSentAt ? <span className="ig-sent">Reminder sent {r.reminderSentAt}</span> : <span className="ig-none">Not reminded yet</span>}
              </div>
            </div>
            <div className="ig-action">
              {st.done ? <span className="ig-ok">✓ {st.done}</span>
                : st.err ? <span className="ig-errtxt">{st.err}</span>
                : !r.hasEmail ? <span className="ig-none">No email on file</span>
                : <button className="ig-btn" disabled={st.busy} onClick={() => remind(r.id)}>{st.busy ? "Sending…" : r.reminderSentAt ? "Remind again" : "Send reminder"}</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
