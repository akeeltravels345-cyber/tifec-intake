"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface ClientRow {
  id: string; first: string; last: string; dob: string | null; age: number | null;
  insurer: string; seenBy: string; billable: number;
}

export default function ClientsList({ rows, seesAll }: { rows: ClientRow[]; seesAll: boolean }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  const term = q.trim().toLowerCase();
  const filtered = term
    ? rows.filter((r) => `${r.first} ${r.last}`.toLowerCase().includes(term) || `${r.last} ${r.first}`.toLowerCase().includes(term))
    : rows;

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // Select-all targets the visible clients who actually have something to claim.
  const claimable = filtered.filter((r) => r.billable > 0);
  const allSel = claimable.length > 0 && claimable.every((r) => sel.has(r.id));
  const toggleAll = () => setSel((s) => {
    if (allSel) return new Set();
    const n = new Set(s); claimable.forEach((r) => n.add(r.id)); return n;
  });

  const selWithClaims = [...sel].filter((id) => rows.find((r) => r.id === id)?.billable);
  const generate = () => { if (selWithClaims.length) router.push(`/billing/clients/batch?ids=${selWithClaims.join(",")}`); };

  return (
    <div className="su-sec">
      {rows.length > 0 && (
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <input className="ls-in" type="search" placeholder="Search clients by name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search clients by name" style={{ maxWidth: 340 }} />
          {term && <span className="su-hint">{filtered.length} of {rows.length}</span>}
        </div>
      )}
      <div className="su-card">
        {rows.length === 0 ? (
          <div className="bq-empty" style={{ padding: 28 }}><div className="big">No clients yet</div><div className="small">They&apos;ll appear here once sessions are logged or a roster is imported.</div></div>
        ) : filtered.length === 0 ? (
          <div className="bq-empty" style={{ padding: 28 }}><div className="big">No clients match &ldquo;{q}&rdquo;</div><div className="small">Try a different name.</div></div>
        ) : (
          <div className="su-tblwrap">
            <table className="su-tbl" style={{ minWidth: 620 }}>
              <thead>
                <tr>
                  <th style={{ width: 30 }}><input type="checkbox" checked={allSel} onChange={toggleAll} aria-label="Select all claimable" /></th>
                  <th>Client</th>
                  <th>Date of birth</th>
                  <th>Usual insurer</th>
                  {seesAll && <th>Seen by</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td><input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} disabled={c.billable === 0} title={c.billable === 0 ? "No insured sessions to claim" : undefined} aria-label={`Select ${c.first} ${c.last}`} /></td>
                    <td className="nm"><Link href={`/billing/clients/${c.id}`} className="bq-clientlink">{c.last}, {c.first}</Link></td>
                    <td>{c.dob ? <>{c.dob}{c.age != null && <span className="su-hint"> · {c.age}y</span>}</> : <span className="su-hint">—</span>}</td>
                    <td>{c.insurer}</td>
                    {seesAll && <td className="su-hint">{c.seenBy || "—"}</td>}
                    <td style={{ textAlign: "right" }}><Link className="su-link" href={`/billing/clients/${c.id}`}>Open →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selWithClaims.length > 0 && (
        <div className="bq-bulk">
          <div><div className="bt">{selWithClaims.length} client{selWithClaims.length === 1 ? "" : "s"} selected</div><div className="bsub">Build their CMS-1500 claims in one print run</div></div>
          <div className="sp" />
          <button className="go" onClick={generate}>Generate CMS-1500</button>
          <button className="x" onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}
    </div>
  );
}
