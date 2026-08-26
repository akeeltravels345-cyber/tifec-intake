"use client";

import { Fragment, useMemo, useState } from "react";
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

  // Group the flagged claims by the month they book to, then by clinician.
  const months = useMemo(() => {
    const byMonth = new Map<string, Map<string, FixRow[]>>();
    for (const r of shown) {
      const m = r.collectedDate.slice(0, 7);
      if (!byMonth.has(m)) byMonth.set(m, new Map());
      const byClin = byMonth.get(m)!;
      if (!byClin.has(r.clinician)) byClin.set(r.clinician, []);
      byClin.get(r.clinician)!.push(r);
    }
    return [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([m, byClin]) => {
      const clinicians = [...byClin.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, rs]) => ({ name, rows: [...rs].sort((x, y) => x.dateOfService.localeCompare(y.dateOfService)) }));
      const all = clinicians.flatMap((c) => c.rows);
      return { m, clinicians, count: all.length, total: all.reduce((s, r) => s + r.amount, 0), ids: all.map((r) => r.id) };
    });
  }, [shown]);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleMany = (ids: string[]) => setSelected((s) => {
    const n = new Set(s); const all = ids.every((id) => n.has(id));
    ids.forEach((id) => (all ? n.delete(id) : n.add(id))); return n;
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

          {shown.length === 0 ? (
            <div className="su-expempty" style={{ padding: 20 }}>No match for &ldquo;{q}&rdquo;.</div>
          ) : months.map((mo) => (
            <div key={mo.m} className="fx-month">
              <div className="fx-mhead">
                <input type="checkbox" className="fx-mselect" checked={mo.ids.every((id) => selected.has(id))} onChange={() => toggleMany(mo.ids)} title="Select all in this month" />
                <span className="fx-mtitle">{monthLabel(mo.m + "-01")}</span>
                <span className="fx-mmeta">{mo.count} claim{mo.count === 1 ? "" : "s"} · {money(mo.total)}</span>
              </div>
              <div className="su-tblwrap"><table className="su-tbl fx-tbl">
                <thead>
                  <tr><th className="fx-chk"></th><th>Client</th><th>Insurer</th><th>Service date</th><th className="num">Insurance</th><th>New collected date</th></tr>
                </thead>
                <tbody>
                  {mo.clinicians.map((c) => (
                    <Fragment key={c.name}>
                      <tr className="fx-clinrow">
                        <td className="fx-chk"><input type="checkbox" checked={c.rows.every((r) => selected.has(r.id))} onChange={() => toggleMany(c.rows.map((r) => r.id))} title="Select this clinician" /></td>
                        <td colSpan={5} className="fx-clinname">{c.name} <span className="fx-clincount">{c.rows.length}</span></td>
                      </tr>
                      {c.rows.map((r) => (
                        <tr key={r.id} className={selected.has(r.id) ? "on" : ""}>
                          <td className="fx-chk"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label="Select" /></td>
                          <td className="nm">{r.client}</td>
                          <td>{r.insurer}</td>
                          <td>{r.dateOfService}</td>
                          <td className="num">{money(r.amount)}</td>
                          <td><input type="date" className="fx-date" max={today} disabled={busy}
                            onChange={(e) => { if (e.target.value && e.target.value !== r.dateOfService) setDates([r.id], e.target.value); }} /></td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table></div>
            </div>
          ))}
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
