"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface Claim {
  id: string; dos: string; age: number;
  clinicianId: string; clinicianName: string; clientName: string;
  insurerId: string; insurerName: string; amount: number; paid: boolean; paidDate: string | null;
  /** The biller's cut of THIS claim, at this clinician's own rate. */
  commission: number;
}
export interface QueueData {
  outstanding: Claim[]; billed: Claim[];
  commissionThisMonth: number; waitingCommission: number;
  outstandingTotal: number; awaitingCount: number; oldestDays: number;
  buckets: { label: string; color: string; amount: number; count: number }[];
  clinicians: { id: string; name: string }[];
  today: string;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const bucketOf = (age: number) => (age <= 14 ? 0 : age <= 30 ? 1 : age <= 60 ? 2 : 3);

export default function BillingQueueClient({ data }: { data: QueueData }) {
  const router = useRouter();
  // Rates differ per clinician, so a cut is always summed from the claims
  // themselves rather than derived from a total.
  const comm = (claims: Claim[]) => claims.reduce((t, c) => t + c.commission, 0);
  const [tab, setTab] = useState<"outstanding" | "billed">("outstanding");
  const [groupBy, setGroupBy] = useState<"insurer" | "clinician">("insurer");
  const [q, setQ] = useState("");
  const [filterClin, setFilterClin] = useState("");
  const [bucket, setBucket] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchDate, setBatchDate] = useState(data.today);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => data.outstanding.filter((c) =>
    (!q || c.clientName.toLowerCase().includes(q.toLowerCase())) &&
    (!filterClin || c.clinicianId === filterClin) &&
    (bucket === null || bucketOf(c.age) === bucket)
  ), [data.outstanding, q, filterClin, bucket]);

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

  const selClaims = data.outstanding.filter((c) => selected.has(c.id));
  const selTotal = selClaims.reduce((t, c) => t + c.amount, 0);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleGroup = (claims: Claim[]) => setSelected((s) => {
    const n = new Set(s); const all = claims.every((c) => n.has(c.id));
    claims.forEach((c) => (all ? n.delete(c.id) : n.add(c.id))); return n;
  });
  const clearFilters = () => { setQ(""); setFilterClin(""); setBucket(null); };

  async function mark(ids: string[], paid: boolean, paidDate: string | null) {
    setBusy(true);
    try {
      for (const id of ids) {
        await fetch("/api/billing/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: id, paid, paidDate }) });
      }
      setSelected(new Set());
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="bq-topbar">
        <h1 className="bq-h1">Billing queue</h1>
        <p className="bq-sub">Reconcile an insurer&apos;s remittance: tick the claims it covers, set the paid date, mark them together · amounts in KYD</p>
      </div>

      {/* Work-status ribbon: the queue is the operational surface, so it leads
          with what's left to do — not the commission figure (that lives on the
          dashboard). Your cut is kept, but muted and to the side. */}
      <div className="bq-workbar">
        <div className="bq-wstat"><span className="bq-wk">To reconcile</span><span className="bq-wv mono">{data.awaitingCount} <small>claim{data.awaitingCount === 1 ? "" : "s"}</small></span></div>
        <div className="bq-wstat"><span className="bq-wk">Outstanding</span><span className="bq-wv mono">{money0(data.outstandingTotal)}</span></div>
        <div className="bq-wstat"><span className="bq-wk">Oldest claim</span><span className={`bq-wv mono ${data.oldestDays >= 15 ? "warn" : ""}`}>{data.oldestDays} day{data.oldestDays === 1 ? "" : "s"}</span></div>
        <span className="bq-wspace" />
        <div className="bq-wcut">
          <div className="c">Your cut so far <b>{money(data.commissionThisMonth)}</b></div>
          <div className="c">+{money(data.waitingCommission)} pending on open</div>
        </div>
      </div>

      {/* Aging filter chips — slim pills that drive the list filter. */}
      <div className="bq-chips">
        <button className={`bq-chip ${bucket === null ? "on" : ""}`} onClick={() => setBucket(null)}>
          All ages<span className="cc">{data.awaitingCount}</span>
        </button>
        {data.buckets.map((b, i) => (
          <button key={b.label} className={`bq-chip ${bucket === i ? "on" : ""}`} onClick={() => setBucket(bucket === i ? null : i)}>
            <span className="cd" style={{ background: b.color }} />{b.label}<span className="cc">{b.count}</span>
          </button>
        ))}
      </div>

      <div className="bq-toolbar">
        <div className="bq-tabs">
          <button className={`bq-tab ${tab === "outstanding" ? "on" : ""}`} onClick={() => setTab("outstanding")}>Outstanding ({data.outstanding.length})</button>
          <button className={`bq-tab ${tab === "billed" ? "on" : ""}`} onClick={() => setTab("billed")}>Billed ({data.billed.length})</button>
        </div>
        {tab === "outstanding" && <>
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
        </>}
      </div>

      {tab === "outstanding" ? (
        groups.length === 0 ? (
          <div className="bq-group"><div className="bq-empty"><div className="big">Nothing outstanding here</div><div className="small">Every claim in this view has been marked billed.</div></div></div>
        ) : (
          <div className="bq-groups">
            {groups.map((g) => {
              const allSel = g.claims.every((c) => selected.has(c.id));
              return (
                <div className="bq-group" key={g.key}>
                  <div className="bq-ghead">
                    <input type="checkbox" className="bq-check" checked={allSel} onChange={() => toggleGroup(g.claims)} />
                    <div>
                      <div className="bq-gname">{g.name}</div>
                      <div className="bq-gmeta">{g.claims.length} claim{g.claims.length === 1 ? "" : "s"} · <span className={`bq-age ${g.oldest >= 15 ? "warn" : ""}`}>oldest {g.oldest}d</span></div>
                    </div>
                    <div className="bq-gright"><div className="bq-gtot">{money(g.total)}</div><div className="bq-gcomm">+{money(comm(g.claims))} to you</div></div>
                  </div>
                  {g.claims.map((c) => (
                    <div className={`bq-row ${selected.has(c.id) ? "sel" : ""}`} key={c.id}>
                      <input type="checkbox" className="bq-check" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                      <div className="dos">{c.dos}</div>
                      <div><span className={`bq-age ${c.age >= 15 ? "warn" : ""}`}>{c.age} days</span></div>
                      <div className="who"><div className="cl">{c.clientName}</div><div className="cn">{groupBy === "insurer" ? c.clinicianName : c.insurerName}</div></div>
                      <div className="amt">{money(c.amount)}</div>
                      <div className="comm">+{money(c.commission)}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="bq-billed">
          <div className="bq-thead"><span>Paid</span><span>Client</span><span>Clinician</span><span className="r">Amount</span><span className="r">Your 3%</span><span className="r"></span></div>
          {data.billed.length === 0 ? <div className="bq-empty"><div className="big">No payments recorded yet</div></div> : data.billed.map((c) => (
            <div className="bq-brow" key={c.id}>
              <span className="pill">✓ {c.paidDate}</span>
              <span>{c.clientName}</span>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{c.clinicianName}</span>
              <span className="amt">{money(c.amount)}</span>
              <span className="comm">+{money(c.commission)}</span>
              <button className="bq-undo" disabled={busy} onClick={() => mark([c.id], false, null)}>Undo</button>
            </div>
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <div className="bq-bulk">
          <div><div className="bt">{selected.size} claim{selected.size === 1 ? "" : "s"} selected</div><div className="bsub">{money(selTotal)} insurance · <span className="comm">+{money(comm(selClaims))} to you</span></div></div>
          <div className="sp" />
          <label>Paid date <input type="date" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} /></label>
          <button className="go" disabled={busy} onClick={() => mark([...selected], true, batchDate)}>{busy ? "Marking…" : `Mark ${selected.size} billed`}</button>
          <button className="x" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}
    </>
  );
}
