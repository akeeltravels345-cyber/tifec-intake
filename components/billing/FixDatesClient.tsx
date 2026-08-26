"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface FixRow {
  id: string;
  client: string;
  clinician: string;
  insurer: string;
  dateOfService: string;
  collectedDate: string;
  amount: number;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthLabel = (iso: string) => {
  const [y, m] = iso.split("-");
  const names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(m)] ?? m} ${y}`;
};

export default function FixDatesClient({ rows, today }: { rows: FixRow[]; today: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDate, setBulkDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? rows.filter((r) => `${r.client} ${r.clinician} ${r.insurer}`.toLowerCase().includes(t)) : rows;
  }, [rows, q]);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const selRows = rows.filter((r) => selected.has(r.id));
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.has(r.id));

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    if (allShownSelected) shown.forEach((r) => n.delete(r.id));
    else shown.forEach((r) => n.add(r.id));
    return n;
  });

  async function setDates(ids: string[], date: string) {
    if (!ids.length || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setBusy(true); setErr("");
    try {
      for (const id of ids) {
        const res = await fetch("/api/billing/payments", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: id, action: "paid", paid: true, paidDate: date }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not update.");
      }
      setSelected(new Set());
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="su-topbar">
        <h1 className="su-h1">Fix collected dates</h1>
        <p className="su-sub">Insured claims whose collected date was left equal to the service date (the old default), so they may be booked to the wrong payout month. Set each one to the date the insurance payment actually came in, and it re-books to the right month.</p>
      </div>

      {rows.length === 0 ? (
        <div className="bq-empty" style={{ padding: 28 }}><div className="big">All clear</div><div className="small">No claims left with a collected date matching the service date.</div></div>
      ) : (
        <>
          <div className="bal-kpis two">
            <div className="bal-kpi"><div className="k">Claims to fix</div><div className="v">{rows.length}</div></div>
            <div className="bal-kpi"><div className="k">Insurance value</div><div className="v">{money(total)}</div></div>
          </div>

          <div className="cp-bar">
            <input className="cp-search" placeholder="Search client, clinician or insurer…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {err && <p className="ls-err" style={{ margin: "0 0 10px" }}>{err}</p>}

          <div className="su-tblwrap"><table className="su-tbl fx-tbl">
            <thead>
              <tr>
                <th className="fx-chk"><input type="checkbox" checked={allShownSelected} onChange={toggleAll} title="Select all shown" /></th>
                <th>Client</th><th>Clinician</th><th>Insurer</th>
                <th>Service date</th><th>Booked to</th><th className="num">Insurance</th><th>New collected date</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={8} className="su-expempty">No match for &ldquo;{q}&rdquo;.</td></tr>
              ) : shown.map((r) => (
                <tr key={r.id} className={selected.has(r.id) ? "on" : ""}>
                  <td className="fx-chk"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label="Select" /></td>
                  <td className="nm">{r.client}</td>
                  <td>{r.clinician}</td>
                  <td>{r.insurer}</td>
                  <td>{r.dateOfService}</td>
                  <td className="fx-wrong">{monthLabel(r.collectedDate)}</td>
                  <td className="num">{money(r.amount)}</td>
                  <td>
                    <input type="date" className="fx-date" max={today} disabled={busy}
                      onChange={(e) => { if (e.target.value && e.target.value !== r.dateOfService) setDates([r.id], e.target.value); }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </>
      )}

      {selected.size > 0 && (
        <div className="bq-bulk fx-bulk">
          <div><div className="bt">{selected.size} claim{selected.size === 1 ? "" : "s"} selected</div><div className="bsub">{money(selRows.reduce((s, r) => s + r.amount, 0))} insurance</div></div>
          <div className="sp" />
          <label>Collected date <input type="date" value={bulkDate} max={today} onChange={(e) => setBulkDate(e.target.value)} /></label>
          <button className="go" disabled={busy} onClick={() => setDates([...selected], bulkDate)}>{busy ? "Saving…" : `Set date on ${selected.size}`}</button>
          <button className="x" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}
    </>
  );
}
