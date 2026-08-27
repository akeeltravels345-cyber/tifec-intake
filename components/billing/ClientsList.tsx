"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Foldable from "./Foldable";

export interface ClientRow {
  id: string; first: string; last: string; dob: string | null; age: number | null;
  insurer: string; seenBy: string; billable: number; paid: number; lastVisit: string;
  clinicianIds: string[];
}

const money0 = (n: number) => (n ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—");
type SortKey = "name" | "insurer" | "clinician" | "paid" | "lastVisit";

export default function ClientsList({ rows, seesAll, clinicians = [], assignable = [], insurers = [] }: {
  rows: ClientRow[]; seesAll: boolean;
  clinicians?: { id: string; name: string }[];
  assignable?: { id: string; name: string }[];
  insurers?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  // "Add a client on behalf of a clinician" (biller/owner/admin).
  const [adding, setAdding] = useState(false);
  const [nClin, setNClin] = useState("");
  const [nFirst, setNFirst] = useState("");
  const [nLast, setNLast] = useState("");
  const [nInsurer, setNInsurer] = useState("");
  const [nDob, setNDob] = useState("");
  const [nBusy, setNBusy] = useState(false);
  const [nErr, setNErr] = useState("");

  async function createClient() {
    if (!nClin) { setNErr("Pick the clinician this client belongs to."); return; }
    if (!nFirst.trim() || !nLast.trim()) { setNErr("Enter the client's first and last name."); return; }
    setNBusy(true); setNErr("");
    try {
      const res = await fetch("/api/billing/clients", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicianId: nClin, first: nFirst, last: nLast, insurerId: nInsurer || null, dob: nDob || null }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not add the client.");
      router.push(`/billing/clients/${j.clientId}`);
    } catch (e) { setNErr(e instanceof Error ? e.message : "Could not add the client."); setNBusy(false); }
  }
  const [q, setQ] = useState("");
  const [filterClin, setFilterClin] = useState("");
  const [filterInsurer, setFilterInsurer] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  // Narrow the list: by one insurer (anyone), and/or one clinician's book
  // (biller/owner/admin). The insurer list is just the ones that actually appear.
  const insurerOptions = [...new Set(rows.map((r) => r.insurer))].sort();
  const scoped = rows.filter((r) =>
    (!filterClin || r.clinicianIds.includes(filterClin)) &&
    (!filterInsurer || r.insurer === filterInsurer)
  );
  const term = q.trim().toLowerCase();
  const filtered = term
    ? scoped.filter((r) => `${r.first} ${r.last}`.toLowerCase().includes(term) || `${r.last} ${r.first}`.toLowerCase().includes(term))
    : scoped;

  const byName = (a: ClientRow, b: ClientRow) => `${a.last} ${a.first}`.localeCompare(`${b.last} ${b.first}`);
  const cmp: Record<SortKey, (a: ClientRow, b: ClientRow) => number> = {
    name: byName,
    insurer: (a, b) => a.insurer.localeCompare(b.insurer) || byName(a, b),
    clinician: (a, b) => a.seenBy.localeCompare(b.seenBy) || byName(a, b),
    paid: (a, b) => a.paid - b.paid || byName(a, b),
    // empty last-visit sorts to the end when ascending (oldest-first).
    lastVisit: (a, b) => (a.lastVisit || "￿").localeCompare(b.lastVisit || "￿") || byName(a, b),
  };
  const sorted = [...filtered].sort((a, b) => { const r = cmp[sortKey](a, b); return dir === "asc" ? r : -r; });

  // Click a column to sort by it; click the active column again to flip
  // direction. Money defaults to biggest-first, everything else A→Z / oldest-first.
  const sortBy = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setDir(k === "paid" ? "desc" : "asc"); }
  };
  const th = (k: SortKey, label: string, align: "left" | "right" = "left") => {
    const on = sortKey === k;
    return (
      <th key={k} className={`cl-th${on ? " on" : ""}`} style={{ textAlign: align }} onClick={() => sortBy(k)}
          aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"} title={`Sort by ${label.toLowerCase()}`}>
        <span className="cl-thin" style={align === "right" ? { justifyContent: "flex-end" } : undefined}>
          {label}<span className="cl-arrow">{on ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
        </span>
      </th>
    );
  };

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
      {seesAll && assignable.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button type="button" className="cl-newbtn" onClick={() => { setAdding(true); setNErr(""); }}>+ New client</button>
        </div>
      )}
      {rows.length > 0 && (
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input className="ls-in" type="search" placeholder="Search clients by name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search clients by name" style={{ maxWidth: 300 }} />
          {insurerOptions.length > 1 && (
            <label className="su-hint" style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
              Insurer
              <select className="ls-in" value={filterInsurer} onChange={(e) => setFilterInsurer(e.target.value)} style={{ width: "auto" }} aria-label="Filter by insurer">
                <option value="">All insurers</option>
                {insurerOptions.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
          {seesAll && clinicians.length > 0 && (
            <label className="su-hint" style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
              Clinician
              <select className="ls-in" value={filterClin} onChange={(e) => setFilterClin(e.target.value)} style={{ width: "auto" }} aria-label="Filter by clinician">
                <option value="">All clinicians</option>
                {clinicians.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          {(term || filterClin || filterInsurer) && <span className="su-hint">{filtered.length} of {rows.length}</span>}
          <span style={{ flex: 1 }} />
          <span className="su-hint" style={{ whiteSpace: "nowrap" }}>Tap a column heading to sort ↕</span>
        </div>
      )}
      <div className="su-card">
        {rows.length === 0 ? (
          <div className="bq-empty" style={{ padding: 28 }}><div className="big">No clients yet</div><div className="small">They&apos;ll appear here once sessions are logged or a roster is imported.</div></div>
        ) : filtered.length === 0 ? (
          <div className="bq-empty" style={{ padding: 28 }}><div className="big">No clients match your filters</div><div className="small">Try clearing a filter or searching a different name.</div></div>
        ) : (
          <Foldable unit="clients">
          <div className="su-tblwrap">
            <table className="su-tbl su-tbl-sort" style={{ minWidth: 740 }}>
              <thead>
                <tr>
                  <th style={{ width: 30 }}><input type="checkbox" checked={allSel} onChange={toggleAll} aria-label="Select all claimable" /></th>
                  {th("name", "Client")}
                  <th>Date of birth</th>
                  {th("insurer", "Usual insurer")}
                  {seesAll && th("clinician", "Seen by")}
                  {th("paid", "Paid", "right")}
                  {th("lastVisit", "Last visit")}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.id}>
                    <td><input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} disabled={c.billable === 0} title={c.billable === 0 ? "No insured sessions to claim" : undefined} aria-label={`Select ${c.first} ${c.last}`} /></td>
                    <td className="nm"><Link href={`/billing/clients/${c.id}`} className="bq-clientlink">{c.last}, {c.first}</Link></td>
                    <td>{c.dob ? <>{c.dob}{c.age != null && <span className="su-hint"> · {c.age}y</span>}</> : <span className="su-hint">—</span>}</td>
                    <td className={sortKey === "insurer" ? "cl-oncol" : undefined}>{c.insurer}</td>
                    {seesAll && <td className={`su-hint${sortKey === "clinician" ? " cl-oncol" : ""}`}>{c.seenBy || "—"}</td>}
                    <td className={sortKey === "paid" ? "cl-oncol" : undefined} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money0(c.paid)}</td>
                    <td className={`su-hint${sortKey === "lastVisit" ? " cl-oncol" : ""}`}>{c.lastVisit || "—"}</td>
                    <td style={{ textAlign: "right" }}><Link className="su-link" href={`/billing/clients/${c.id}`}>Open →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </Foldable>
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

      {adding && (
        <div className="cl-modalback" onClick={() => !nBusy && setAdding(false)}>
          <div className="cl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cl-modalhead"><span>New client</span><button type="button" className="cl-modalx" onClick={() => setAdding(false)} aria-label="Close">×</button></div>
            <p className="cl-modalsub">Add a client for a clinician. It goes straight into their book, and dedups against any existing record the same way a logged session would.</p>

            <label className="cl-lab">Assign to clinician <span className="ls-req">*</span>
              <select className="ls-in" value={nClin} onChange={(e) => setNClin(e.target.value)} autoFocus>
                <option value="">Choose a clinician…</option>
                {assignable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <div className="cl-row2">
              <label className="cl-lab">First name <span className="ls-req">*</span><input className="ls-in" value={nFirst} onChange={(e) => setNFirst(e.target.value)} /></label>
              <label className="cl-lab">Last name <span className="ls-req">*</span><input className="ls-in" value={nLast} onChange={(e) => setNLast(e.target.value)} /></label>
            </div>
            <label className="cl-lab">Usual insurer
              <select className="ls-in" value={nInsurer} onChange={(e) => setNInsurer(e.target.value)}>
                <option value="">Self-pay</option>
                {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </label>
            <label className="cl-lab">Date of birth <span className="cl-opt">optional, helps match records and claims</span><input type="date" className="ls-in" value={nDob} onChange={(e) => setNDob(e.target.value)} /></label>

            {nErr && <div className="cl-err">{nErr}</div>}
            <div className="cl-modalfoot">
              <button type="button" className="cl-cancel" onClick={() => setAdding(false)}>Cancel</button>
              <button type="button" className="cl-newbtn" onClick={createClient} disabled={nBusy}>{nBusy ? "Adding…" : "Add client"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
