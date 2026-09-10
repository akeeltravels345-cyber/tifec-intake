"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface CopayRow { id: string; date: string; clientId: string | null; client: string; clinician: string; owed: number }

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function OutstandingCopays({ rows, today, showClinician, canToggle = false, scope = "all" }: { rows: CopayRow[]; today: string; showClinician: boolean; canToggle?: boolean; scope?: "all" | "mine" }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  const shown = q.trim() ? rows.filter((r) => r.client.toLowerCase().includes(q.toLowerCase())) : rows;
  const total = Math.round((rows.reduce((t, r) => t + r.owed, 0) + Number.EPSILON) * 100) / 100;

  // Multi-select: tick several charges for ONE client and bill them on a single
  // invoice. An invoice is per-client, so selecting a different client's charge
  // starts a fresh selection for that client.
  const [selected, setSelected] = useState<string[]>([]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const selClientId = selected.length ? byId.get(selected[0])?.clientId ?? null : null;
  const selClientName = selected.length ? byId.get(selected[0])?.client ?? "" : "";
  const selTotal = Math.round((selected.reduce((t, id) => t + (byId.get(id)?.owed || 0), 0) + Number.EPSILON) * 100) / 100;
  const canSelect = (r: CopayRow) => !!r.clientId && (!selClientId || r.clientId === selClientId);
  function toggle(r: CopayRow) {
    if (!r.clientId) return;
    setSelected((prev) => {
      if (prev.includes(r.id)) return prev.filter((x) => x !== r.id);
      const cur = prev.length ? byId.get(prev[0])?.clientId : null;
      return cur && cur !== r.clientId ? [r.id] : [...prev, r.id]; // switching client resets the selection
    });
  }

  async function collect(id: string) {
    setBusy(id); setErr("");
    try {
      const res = await fetch("/api/billing/copay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: id, date }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  }

  return (
    <>
      <div className="su-topbar">
        <h1 className="su-h1">Outstanding co-pays</h1>
        <p className="su-sub">Co-pays that were due at a visit but not collected. Record each one when it comes in, and it books to the date received.{scope === "mine" ? " Showing your clients." : ""}</p>
        {canToggle && (
          <div className="cp-scope" role="tablist" aria-label="Whose co-pays">
            <Link href="/billing/copays?scope=mine" className={`cp-scopebtn ${scope === "mine" ? "on" : ""}`} role="tab" aria-selected={scope === "mine"}>My clients</Link>
            <Link href="/billing/copays?scope=all" className={`cp-scopebtn ${scope === "all" ? "on" : ""}`} role="tab" aria-selected={scope === "all"}>Everyone</Link>
          </div>
        )}
      </div>

      <div className="bal-kpis two">
        <div className="bal-kpi"><div className="k">Total co-pays outstanding</div><div className="v">{money(total)}</div></div>
        <div className="bal-kpi"><div className="k">Visits</div><div className="v">{rows.length}</div></div>
      </div>

      {rows.length === 0 ? (
        <div className="bq-empty" style={{ padding: 28 }}><div className="big">Nothing outstanding</div><div className="small">Every co-pay due has been collected.</div></div>
      ) : (
        <>
          <div className="cp-bar">
            <label className="cp-date">Received on
              <input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <input className="cp-search" placeholder="Search client…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {err && <p className="ls-err" style={{ margin: "0 0 10px" }}>{err}</p>}
          {selected.length > 0 && selClientId && (
            <div className="cp-selbar">
              <span className="cp-selinfo"><b>{selected.length}</b> co-pay{selected.length > 1 ? "s" : ""} for <b>{selClientName}</b> · {money(selTotal)}</span>
              <span style={{ flex: 1 }} />
              <button type="button" className="cp-selclear" onClick={() => setSelected([])}>Clear</button>
              <Link href={`/billing/clients/${selClientId}/invoice?type=copay&sessions=${selected.join(",")}`} className="cp-invoice">Create one invoice</Link>
            </div>
          )}
          <div className="su-tblwrap"><table className="su-tbl cp-tbl">
            <thead>
              <tr><th className="cp-selcol"></th><th>Client</th>{showClinician && <th>Clinician</th>}<th>Visit date</th><th className="num">Co-pay due</th><th></th></tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={showClinician ? 6 : 5} className="su-expempty">No client matches &ldquo;{q}&rdquo;.</td></tr>
              ) : shown.map((r) => (
                <tr key={r.id} className={selected.includes(r.id) ? "cp-selrow" : ""}>
                  <td className="cp-selcol"><input type="checkbox" checked={selected.includes(r.id)} disabled={!canSelect(r)} onChange={() => toggle(r)} title={r.clientId ? (canSelect(r) ? "Select this co-pay" : "Clear the selection to invoice a different client") : "No client record to invoice"} /></td>
                  <td className="nm">{r.clientId ? <Link href={`/billing/clients/${r.clientId}`} className="bal-name">{r.client}</Link> : r.client}</td>
                  {showClinician && <td>{r.clinician}</td>}
                  <td>{r.date}</td>
                  <td className="num cp-owe">{money(r.owed)}</td>
                  <td className="act">
                    <div className="cp-acts">
                      {r.clientId && <Link href={`/billing/clients/${r.clientId}/invoice?type=copay`} className="cp-invoice" title="Print an invoice for this client's outstanding co-pays to follow up">Invoice</Link>}
                      <button className="cp-collect" disabled={busy === r.id} onClick={() => collect(r.id)}>{busy === r.id ? "Recording…" : "Collect"}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </>
      )}
    </>
  );
}
