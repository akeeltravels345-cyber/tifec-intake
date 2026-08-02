"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/** A client's name that links to their record when we know the client id. */
function ClientName({ id, name }: { id: string | null; name: string }) {
  return id ? <Link href={`/billing/clients/${id}`} className="bq-clientlink">{name}</Link> : <>{name}</>;
}

export interface Claim {
  id: string; dos: string; age: number;
  clinicianId: string; clinicianName: string; clientId: string | null; clientName: string;
  insurerId: string; insurerName: string; amount: number;
  billedDate: string | null; paid: boolean; paidDate: string | null;
  /** The biller's cut of THIS claim, at this clinician's own rate. */
  commission: number;
  /** Date of service is after the client's referral end — insurer won't pay. */
  afterReferral?: boolean;
}
export interface QueueData {
  toBill: Claim[]; awaiting: Claim[]; paid: Claim[];
  commissionThisMonth: number; waitingCommission: number;
  outstandingTotal: number; awaitingTotal: number; collectedThisMonth: number;
  toBillCount: number; awaitingCount: number; oldestDays: number;
  buckets: { label: string; color: string; amount: number; count: number }[];
  clinicians: { id: string; name: string }[];
  today: string;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const bucketOf = (age: number) => (age <= 14 ? 0 : age <= 30 ? 1 : age <= 60 ? 2 : 3);

type Tab = "tobill" | "awaiting" | "paid";

export default function BillingQueueClient({ data }: { data: QueueData }) {
  const router = useRouter();
  // Rates differ per clinician, so a cut is always summed from the claims
  // themselves rather than derived from a total.
  const comm = (claims: Claim[]) => claims.reduce((t, c) => t + c.commission, 0);
  const [tab, setTab] = useState<Tab>("tobill");
  const [groupBy, setGroupBy] = useState<"insurer" | "clinician">("insurer");
  const [q, setQ] = useState("");
  const [filterClin, setFilterClin] = useState("");
  const [bucket, setBucket] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Which groups are folded shut (by group key), so long queues stay scannable.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = (key: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const [batchDate, setBatchDate] = useState(data.today);
  const [busy, setBusy] = useState(false);

  // The open list the current tab works on (paid is a read-only history tab).
  const active = tab === "tobill" ? data.toBill : tab === "awaiting" ? data.awaiting : data.paid;
  const isOpen = tab !== "paid";

  const filtered = useMemo(() => active.filter((c) =>
    (!q || c.clientName.toLowerCase().includes(q.toLowerCase())) &&
    (!filterClin || c.clinicianId === filterClin) &&
    (bucket === null || bucketOf(c.age) === bucket)
  ), [active, q, filterClin, bucket]);

  // Aging chip counts reflect the tab you're on, not a fixed server total.
  const chipCounts = useMemo(() => {
    const counts = [0, 0, 0, 0];
    for (const c of active) counts[bucketOf(c.age)]++;
    return counts;
  }, [active]);

  const groups = useMemo(() => {
    const m = new Map<string, { name: string; claims: Claim[] }>();
    for (const c of filtered) {
      const key = groupBy === "insurer" ? c.insurerId : c.clinicianId;
      const name = groupBy === "insurer" ? c.insurerName : c.clinicianName;
      if (!m.has(key)) m.set(key, { name, claims: [] });
      m.get(key)!.claims.push(c);
    }
    return [...m.entries()].map(([key, g]) => ({ key, name: g.name, claims: g.claims, total: g.claims.reduce((t, c) => t + c.amount, 0), oldest: Math.max(...g.claims.map((c) => c.age)) })).sort((a, b) => b.total - a.total);
  }, [filtered, groupBy]);

  const selClaims = active.filter((c) => selected.has(c.id));
  const selTotal = selClaims.reduce((t, c) => t + c.amount, 0);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleGroup = (claims: Claim[]) => setSelected((s) => {
    const n = new Set(s); const all = claims.every((c) => n.has(c.id));
    claims.forEach((c) => (all ? n.delete(c.id) : n.add(c.id))); return n;
  });
  const clearFilters = () => { setQ(""); setFilterClin(""); setBucket(null); };
  const switchTab = (t: Tab) => { setTab(t); setSelected(new Set()); setBucket(null); };

  async function post(ids: string[], payload: Record<string, unknown>) {
    setBusy(true);
    try {
      for (const id of ids) {
        await fetch("/api/billing/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: id, ...payload }) });
      }
      setSelected(new Set());
      router.refresh();
    } finally { setBusy(false); }
  }
  const markBilled = (ids: string[], date: string) => post(ids, { action: "billed", billed: true, billedDate: date });
  const markPaid = (ids: string[], date: string) => post(ids, { action: "paid", paid: true, paidDate: date });
  const unbill = (id: string) => post([id], { action: "billed", billed: false });
  const unpay = (id: string) => post([id], { action: "paid", paid: false });
  // Correct the date on a record that's already billed/paid — a claim that came
  // in last week but got marked today should read last week. Only fires on a
  // real, changed date.
  const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const editBilled = (id: string, cur: string | null, val: string) => { if (isDate(val) && val !== cur) markBilled([id], val); };
  const editPaid = (id: string, cur: string | null, val: string) => { if (isDate(val) && val !== cur) markPaid([id], val); };
  // Build CMS-1500 claims for exactly the selected claims (each id is a session).
  const generateClaims = () => { if (selected.size) router.push(`/billing/clients/batch?sessions=${[...selected].join(",")}`); };

  return (
    <>
      <div className="bq-topbar">
        <h1 className="bq-h1">Billing queue</h1>
        <p className="bq-sub">Submit claims to the insurer, then mark them paid as the money lands. Only paid claims count as collected · amounts in KYD</p>
      </div>

      {/* Work-status ribbon: leads with what's left to do at each stage. Your cut
          is kept, but muted and to the side (it lives on the dashboard). */}
      <div className="bq-workbar">
        <div className="bq-wstat"><span className="bq-wk">To bill</span><span className="bq-wv mono">{data.toBillCount} <small>claim{data.toBillCount === 1 ? "" : "s"}</small></span></div>
        <div className="bq-wstat"><span className="bq-wk">Awaiting payment</span><span className="bq-wv mono">{money0(data.awaitingTotal)}</span></div>
        <div className="bq-wstat"><span className="bq-wk">Collected this month</span><span className="bq-wv mono">{money0(data.collectedThisMonth)}</span></div>
        <div className="bq-wstat"><span className="bq-wk">Oldest open</span><span className={`bq-wv mono ${data.oldestDays >= 15 ? "warn" : ""}`}>{data.oldestDays} day{data.oldestDays === 1 ? "" : "s"}</span></div>
        <span className="bq-wspace" />
        <div className="bq-wcut">
          <div className="c">Your cut so far <b>{money(data.commissionThisMonth)}</b></div>
          <div className="c">+{money(data.waitingCommission)} pending on open</div>
        </div>
      </div>

      {/* Aging filter chips — slim pills that drive the list filter (open tabs). */}
      {isOpen && (
        <div className="bq-chips">
          <button className={`bq-chip ${bucket === null ? "on" : ""}`} onClick={() => setBucket(null)}>
            All ages<span className="cc">{active.length}</span>
          </button>
          {data.buckets.map((b, i) => (
            <button key={b.label} className={`bq-chip ${bucket === i ? "on" : ""}`} onClick={() => setBucket(bucket === i ? null : i)}>
              <span className="cd" style={{ background: b.color }} />{b.label}<span className="cc">{chipCounts[i]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="bq-toolbar">
        <div className="bq-tabs">
          <button className={`bq-tab ${tab === "tobill" ? "on" : ""}`} onClick={() => switchTab("tobill")}>To bill ({data.toBill.length})</button>
          <button className={`bq-tab ${tab === "awaiting" ? "on" : ""}`} onClick={() => switchTab("awaiting")}>Awaiting payment ({data.awaiting.length})</button>
          <button className={`bq-tab ${tab === "paid" ? "on" : ""}`} onClick={() => switchTab("paid")}>Paid ({data.paid.length})</button>
        </div>
        <div className="bq-search"><span style={{ color: "var(--faint)" }}>⌕</span><input placeholder="Search client…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="bq-selct" value={filterClin} onChange={(e) => setFilterClin(e.target.value)}>
          <option value="">All clinicians</option>
          {data.clinicians.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="bq-tabs">
          <button className={`bq-tab ${groupBy === "insurer" ? "on" : ""}`} onClick={() => setGroupBy("insurer")}>By insurer</button>
          <button className={`bq-tab ${groupBy === "clinician" ? "on" : ""}`} onClick={() => setGroupBy("clinician")}>By clinician</button>
        </div>
        {(q || filterClin || bucket !== null) && <button className="bq-clear" onClick={clearFilters}>Clear filters</button>}
      </div>

      {isOpen ? (
        groups.length === 0 ? (
          <div className="bq-group"><div className="bq-empty">
            <div className="big">{tab === "tobill" ? "Nothing to bill here" : "Nothing awaiting payment here"}</div>
            <div className="small">{tab === "tobill" ? "Every logged claim in this view has been submitted to the insurer." : "Every submitted claim in this view has been paid."}</div>
          </div></div>
        ) : (
          <div className="bq-groups">
            {groups.map((g) => {
              const allSel = g.claims.every((c) => selected.has(c.id));
              const open = !collapsed.has(g.key);
              return (
                <div className="bq-group" key={g.key}>
                  <div className="bq-ghead" onClick={() => toggleCollapse(g.key)} role="button" aria-expanded={open} title={open ? "Collapse" : "Expand"}>
                    <input type="checkbox" className="bq-check" checked={allSel} onChange={() => toggleGroup(g.claims)} onClick={(e) => e.stopPropagation()} />
                    <div>
                      <div className="bq-gname">{g.name}</div>
                      <div className="bq-gmeta">{g.claims.length} claim{g.claims.length === 1 ? "" : "s"} · <span className={`bq-age ${g.oldest >= 15 ? "warn" : ""}`}>oldest {g.oldest}d</span></div>
                    </div>
                    <div className="bq-gright"><div className="bq-gtot">{money(g.total)}</div><div className="bq-gcomm">+{money(comm(g.claims))} to you</div></div>
                    <span className={`bq-gchev ${open ? "open" : ""}`} aria-hidden="true">›</span>
                  </div>
                  {open && g.claims.map((c) => (
                    <div className={`bq-row ${selected.has(c.id) ? "sel" : ""} ${tab === "awaiting" ? "act" : ""}`} key={c.id}>
                      <input type="checkbox" className="bq-check" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                      <div className={`dos ${tab === "awaiting" ? "bq-leaddate" : ""}`}>{tab === "awaiting"
                        ? <input type="date" className="bq-dateedit lead" value={c.billedDate ?? ""} max={data.today} disabled={busy} onChange={(e) => editBilled(c.id, c.billedDate, e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} title="Billed date — back-date to when the claim actually came in" />
                        : c.dos}</div>
                      <div><span className={`bq-age ${c.age >= 15 ? "warn" : ""}`}>{c.age} days</span></div>
                      <div className="who"><div className="cl"><ClientName id={c.clientId} name={c.clientName} />{c.afterReferral && <span className="bq-refflag" title="Date of service is after this client's referral ended — the insurer won't pay">⚠ after referral</span>}</div><div className="cn">{groupBy === "insurer" ? c.clinicianName : c.insurerName}</div></div>
                      <div className="amt">{money(c.amount)}</div>
                      <div className="comm">+{money(c.commission)}</div>
                      {tab === "awaiting" && <button className="bq-undo" disabled={busy} onClick={() => unbill(c.id)} title="Move back to To bill">Un-bill</button>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="bq-billed">
          <div className="bq-thead"><span>Paid</span><span>Client</span><span>{groupBy === "insurer" ? "Clinician" : "Insurer"}</span><span className="r">Amount</span><span className="r">Your cut</span><span className="r"></span></div>
          {data.paid.length === 0 ? (
            <div className="bq-empty"><div className="big">No payments recorded yet</div></div>
          ) : groups.length === 0 ? (
            <div className="bq-empty"><div className="big">No paid claims match your filters</div></div>
          ) : groups.map((g) => {
            const open = !collapsed.has(g.key);
            return (
            <div key={g.key}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 14px 8px", borderTop: "1px solid var(--line, #eae5db)", cursor: "pointer" }} onClick={() => toggleCollapse(g.key)} role="button" aria-expanded={open} title={open ? "Collapse" : "Expand"}>
                <span className="bq-gname">{g.name}</span>
                <span className="bq-gmeta">{g.claims.length} paid</span>
                <span style={{ flex: 1 }} />
                <span className="bq-gtot">{money(g.total)}</span>
                <span className="bq-gcomm" style={{ marginLeft: 10 }}>+{money(comm(g.claims))} to you</span>
                <span className={`bq-gchev ${open ? "open" : ""}`} aria-hidden="true">›</span>
              </div>
              {open && [...g.claims].sort((a, b) => (b.paidDate ?? "").localeCompare(a.paidDate ?? "")).map((c) => (
                <div className="bq-brow" key={c.id}>
                  <span className="pill">✓ <input type="date" className="bq-dateedit onpill" value={c.paidDate ?? ""} max={data.today} disabled={busy} onChange={(e) => editPaid(c.id, c.paidDate, e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} title="Paid date — click to change (back-date to when it actually settled)" /></span>
                  <span><ClientName id={c.clientId} name={c.clientName} /></span>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>{groupBy === "insurer" ? c.clinicianName : c.insurerName}</span>
                  <span className="amt">{money(c.amount)}</span>
                  <span className="comm">+{money(c.commission)}</span>
                  <button className="bq-undo" disabled={busy} onClick={() => unpay(c.id)}>Undo</button>
                </div>
              ))}
            </div>
            );
          })}
        </div>
      )}

      {isOpen && selected.size > 0 && (
        <div className="bq-bulk">
          <div><div className="bt">{selected.size} claim{selected.size === 1 ? "" : "s"} selected</div><div className="bsub">{money(selTotal)} insurance · <span className="comm">+{money(comm(selClaims))} to you</span></div></div>
          <div className="sp" />
          <button className="gen" onClick={generateClaims} title="Build CMS-1500 claims for the selected claims">Generate CMS-1500</button>
          {tab === "tobill" ? (
            <>
              <label>Billed date <input type="date" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} /></label>
              <button className="go" disabled={busy} onClick={() => markBilled([...selected], batchDate)}>{busy ? "Submitting…" : `Mark ${selected.size} billed`}</button>
            </>
          ) : (
            <>
              <label>Paid date <input type="date" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} /></label>
              <button className="go" disabled={busy} onClick={() => markPaid([...selected], batchDate)}>{busy ? "Marking…" : `Mark ${selected.size} paid`}</button>
            </>
          )}
          <button className="x" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}
    </>
  );
}
