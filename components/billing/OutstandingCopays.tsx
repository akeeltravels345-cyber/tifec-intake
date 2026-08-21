"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface CopayRow { id: string; date: string; clientId: string | null; client: string; clinician: string; owed: number }

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function OutstandingCopays({ rows, today, showClinician }: { rows: CopayRow[]; today: string; showClinician: boolean }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  const shown = q.trim() ? rows.filter((r) => r.client.toLowerCase().includes(q.toLowerCase())) : rows;
  const total = Math.round((rows.reduce((t, r) => t + r.owed, 0) + Number.EPSILON) * 100) / 100;

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
        <p className="su-sub">Co-pays that were due at a visit but not collected. Record each one when it comes in — it books to the date received.{showClinician ? "" : " These are your visits."}</p>
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
          <div className="su-tblwrap"><table className="su-tbl cp-tbl">
            <thead>
              <tr><th>Client</th>{showClinician && <th>Clinician</th>}<th>Visit date</th><th className="num">Co-pay due</th><th></th></tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={showClinician ? 5 : 4} className="su-expempty">No client matches &ldquo;{q}&rdquo;.</td></tr>
              ) : shown.map((r) => (
                <tr key={r.id}>
                  <td className="nm">{r.clientId ? <Link href={`/billing/clients/${r.clientId}`} className="bal-name">{r.client}</Link> : r.client}</td>
                  {showClinician && <td>{r.clinician}</td>}
                  <td>{r.date}</td>
                  <td className="num cp-owe">{money(r.owed)}</td>
                  <td className="act"><button className="cp-collect" disabled={busy === r.id} onClick={() => collect(r.id)}>{busy === r.id ? "Recording…" : "Collect"}</button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </>
      )}
    </>
  );
}
