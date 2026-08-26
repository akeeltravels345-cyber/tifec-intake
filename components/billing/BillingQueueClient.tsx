"use client";

import { Fragment, useMemo, useState } from "react";
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
  /** On the Written off / down tab: the amount written off/down, and which. */
  off?: number;
  disposition?: "writeoff" | "writedown";
}
export interface QueueData {
  toBill: Claim[]; awaiting: Claim[]; selfPay: Claim[]; paid: Claim[]; adjusted: Claim[];
  commissionThisMonth: number; waitingCommission: number;
  outstandingTotal: number; awaitingTotal: number; collectedThisMonth: number;
  writeOffThisMonth: number; writeDownThisMonth: number;
  toBillCount: number; awaitingCount: number; oldestDays: number;
  buckets: { label: string; color: string; amount: number; count: number }[];
  clinicians: { id: string; name: string }[];
  today: string;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const bucketOf = (age: number) => (age <= 14 ? 0 : age <= 30 ? 1 : age <= 60 ? 2 : 3);

type Tab = "tobill" | "awaiting" | "selfpay" | "paid" | "adjusted";

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
  // Per-claim write-off / write-down inline form.
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [adjDisp, setAdjDisp] = useState<"writeoff" | "writedown">("writeoff");
  const [adjMode, setAdjMode] = useState<"adjusted" | "collected">("adjusted");
  const [adjAmt, setAdjAmt] = useState("");
  const [adjDate, setAdjDate] = useState(data.today);

  // The open list the current tab works on (paid + adjusted are read-only history).
  const active = tab === "tobill" ? data.toBill : tab === "awaiting" ? data.awaiting : tab === "selfpay" ? data.selfPay : tab === "adjusted" ? data.adjusted : data.paid;
  const isOpen = tab === "tobill" || tab === "awaiting" || tab === "selfpay";

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
  const unadjust = (id: string) => post([id], { action: "unadjust" });
  const openAdjust = (id: string) => { setAdjustId(id); setAdjDisp("writeoff"); setAdjMode("adjusted"); setAdjAmt(""); setAdjDate(data.today); };
  async function submitAdjust(id: string, billedAmt: number) {
    const amt = Number(adjAmt) || 0;
    const collected = Math.max(0, Math.min(billedAmt, adjMode === "collected" ? amt : billedAmt - amt));
    await post([id], { action: "adjust", disposition: adjDisp, insuranceCollected: collected, paidDate: adjDate });
    setAdjustId(null);
  }
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
        <p className="bq-sub">Bill claims to the insurer, then mark them collected as the money lands. Only collected claims pay out · amounts in KYD</p>
      </div>

      {/* Work-status ribbon: leads with what's left to do at each stage. Your cut
          is kept, but muted and to the side (it lives on the dashboard). */}
      <div className="bq-workbar">
        <div className="bq-wstat"><span className="bq-wk">To bill</span><span className="bq-wv mono">{data.toBillCount} <small>claim{data.toBillCount === 1 ? "" : "s"}</small></span></div>
        <div className="bq-wstat"><span className="bq-wk">Awaiting payment</span><span className="bq-wv mono">{money0(data.awaitingTotal)}</span></div>
        <div className="bq-wstat"><span className="bq-wk">Collected this month</span><span className="bq-wv mono">{money0(data.collectedThisMonth)}</span></div>
        {(data.writeOffThisMonth > 0 || data.writeDownThisMonth > 0) && (
          <div className="bq-wstat" title="Written off (contractual) and written down this month — not collected, never paid out. Reported separately.">
            <span className="bq-wk">Written off / down this month</span>
            <span className="bq-wv mono">{money0(data.writeOffThisMonth + data.writeDownThisMonth)}</span>
          </div>
        )}
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
          {data.selfPay.length > 0 && <button className={`bq-tab ${tab === "selfpay" ? "on" : ""}`} onClick={() => switchTab("selfpay")}>Self-pay ({data.selfPay.length})</button>}
          <button className={`bq-tab ${tab === "paid" ? "on" : ""}`} onClick={() => switchTab("paid")}>Collected ({data.paid.length})</button>
          {data.adjusted.length > 0 && <button className={`bq-tab ${tab === "adjusted" ? "on" : ""}`} onClick={() => switchTab("adjusted")}>Written off / down ({data.adjusted.length})</button>}
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
            <div className="big">{tab === "tobill" ? "Nothing to bill here" : tab === "selfpay" ? "No self-pay balances here" : "Nothing awaiting payment here"}</div>
            <div className="small">{tab === "tobill" ? "Every logged claim in this view has been billed to the insurer." : tab === "selfpay" ? "Every self-pay visit in this view has been collected or waived." : "Every billed claim in this view has been collected."}</div>
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
                  {open && g.claims.map((c) => {
                    const amt = Number(adjAmt) || 0;
                    const adjCollected = Math.max(0, Math.min(c.amount, adjMode === "collected" ? amt : c.amount - amt));
                    return (
                    <Fragment key={c.id}>
                    <div className={`bq-row ${selected.has(c.id) ? "sel" : ""} ${tab === "awaiting" ? "act" : ""}`}>
                      <input type="checkbox" className="bq-check" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                      <div className={`dos ${tab === "awaiting" && c.insurerId !== "self" ? "bq-leaddate" : ""}`}>{tab === "awaiting" && c.insurerId !== "self"
                        ? <input type="date" className="bq-dateedit lead" value={c.billedDate ?? ""} max={data.today} disabled={busy} onChange={(e) => editBilled(c.id, c.billedDate, e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} title="Billed date — back-date to when the claim actually came in" />
                        : c.dos}</div>
                      <div><span className={`bq-age ${c.age >= 15 ? "warn" : ""}`}>{c.age} days</span></div>
                      <div className="who"><div className="cl"><ClientName id={c.clientId} name={c.clientName} />{c.afterReferral && <span className="bq-refflag" title="Date of service is after this client's referral ended — the insurer won't pay">⚠ after referral</span>}</div><div className="cn">{groupBy === "insurer" ? c.clinicianName : c.insurerName}</div></div>
                      <div className="amt">{money(c.amount)}</div>
                      <div className="comm">+{money(c.commission)}</div>
                      {tab === "awaiting" && c.insurerId !== "self" && <div className="bq-rowacts"><button className="bq-undo" disabled={busy} onClick={() => unbill(c.id)} title="Move back to To bill">Un-bill</button><button className="bq-undo" disabled={busy} onClick={() => (adjustId === c.id ? setAdjustId(null) : openAdjust(c.id))} title="Settle with a contractual write-off or write-down">Write off/down</button></div>}
                    </div>
                    {adjustId === c.id && (
                      <div className="bq-adjustrow">
                        <select className="ls-in" value={adjDisp} onChange={(e) => setAdjDisp(e.target.value as typeof adjDisp)}><option value="writeoff">Contractual write-off</option><option value="writedown">Write down</option></select>
                        <select className="ls-in" value={adjMode} onChange={(e) => setAdjMode(e.target.value as typeof adjMode)}><option value="adjusted">{adjDisp === "writeoff" ? "Amount written off" : "Amount written down"}</option><option value="collected">Amount collected</option></select>
                        <input type="number" step="0.01" min="0" className="ls-in" style={{ maxWidth: 110 }} value={adjAmt} placeholder="0.00" onChange={(e) => setAdjAmt(e.target.value)} />
                        <input type="date" className="ls-in" style={{ maxWidth: 150 }} value={adjDate} max={data.today} onChange={(e) => setAdjDate(e.target.value)} title="Settled date" />
                        <span className="bq-adjnote">of {money(c.amount)}: collected <b>{money(adjCollected)}</b>, {adjDisp === "writeoff" ? "written off" : "written down"} <b>{money(c.amount - adjCollected)}</b></span>
                        <button className="go sm" disabled={busy} onClick={() => submitAdjust(c.id, c.amount)}>Settle</button>
                        <button className="bq-undo" disabled={busy} onClick={() => setAdjustId(null)}>Cancel</button>
                      </div>
                    )}
                    </Fragment>
                  ); })}
                </div>
              );
            })}
          </div>
        )
      ) : tab === "adjusted" ? (
        <div className="bq-billed">
          <div className="bq-thead"><span>Settled</span><span>Client</span><span>{groupBy === "insurer" ? "Clinician" : "Insurer"}</span><span className="r">Collected</span><span className="r">Off</span><span className="r"></span></div>
          {data.adjusted.length === 0 ? (
            <div className="bq-empty"><div className="big">No write-offs or write-downs</div><div className="small">These never count as collected and never pay out — they&apos;re reported here separately.</div></div>
          ) : groups.length === 0 ? (
            <div className="bq-empty"><div className="big">None match your filters</div></div>
          ) : groups.map((g) => {
            const open = !collapsed.has(g.key);
            const offTot = g.claims.reduce((t, c) => t + (c.off ?? 0), 0);
            return (
            <div key={g.key}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 14px 8px", borderTop: "1px solid var(--line, #eae5db)", cursor: "pointer" }} onClick={() => toggleCollapse(g.key)} role="button" aria-expanded={open} title={open ? "Collapse" : "Expand"}>
                <span className="bq-gname">{g.name}</span>
                <span className="bq-gmeta">{g.claims.length} settled</span>
                <span style={{ flex: 1 }} />
                <span className="bq-gtot">{money(offTot)} off</span>
                <span className={`bq-gchev ${open ? "open" : ""}`} aria-hidden="true">›</span>
              </div>
              {open && [...g.claims].sort((a, b) => (b.paidDate ?? "").localeCompare(a.paidDate ?? "")).map((c) => (
                <div className="bq-brow adj" key={c.id}>
                  <span className={`bq-adjpill ${c.disposition}`}>{c.disposition === "writeoff" ? "Write-off" : "Write-down"}<small>{c.paidDate ?? ""}</small></span>
                  <span><ClientName id={c.clientId} name={c.clientName} /></span>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>{groupBy === "insurer" ? c.clinicianName : c.insurerName}</span>
                  <span className="amt">{money(c.amount)}</span>
                  <span className="amt off">{money(c.off ?? 0)}</span>
                  <button className="bq-undo" disabled={busy} onClick={() => unadjust(c.id)} title="Undo — send this claim back to Awaiting payment">Undo</button>
                </div>
              ))}
            </div>
            );
          })}
        </div>
      ) : (
        <div className="bq-billed">
          <div className="bq-thead"><span>Collected</span><span>Client</span><span>{groupBy === "insurer" ? "Clinician" : "Insurer"}</span><span className="r">Amount</span><span className="r">Your cut</span><span className="r"></span></div>
          {data.paid.length === 0 ? (
            <div className="bq-empty"><div className="big">Nothing collected yet</div></div>
          ) : groups.length === 0 ? (
            <div className="bq-empty"><div className="big">No collected claims match your filters</div></div>
          ) : groups.map((g) => {
            const open = !collapsed.has(g.key);
            return (
            <div key={g.key}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 14px 8px", borderTop: "1px solid var(--line, #eae5db)", cursor: "pointer" }} onClick={() => toggleCollapse(g.key)} role="button" aria-expanded={open} title={open ? "Collapse" : "Expand"}>
                <span className="bq-gname">{g.name}</span>
                <span className="bq-gmeta">{g.claims.length} collected</span>
                <span style={{ flex: 1 }} />
                <span className="bq-gtot">{money(g.total)}</span>
                <span className="bq-gcomm" style={{ marginLeft: 10 }}>+{money(comm(g.claims))} to you</span>
                <span className={`bq-gchev ${open ? "open" : ""}`} aria-hidden="true">›</span>
              </div>
              {open && [...g.claims].sort((a, b) => (b.paidDate ?? "").localeCompare(a.paidDate ?? "")).map((c) => (
                <div className="bq-brow" key={c.id}>
                  <span className="pill"><span className="ok" aria-hidden="true">✓</span><input type="date" className="bq-dateedit onpill" value={c.paidDate ?? ""} max={data.today} disabled={busy} onChange={(e) => editPaid(c.id, c.paidDate, e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} title="Collected date — click to change (back-date to when it actually settled)" /></span>
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
          <div><div className="bt">{selected.size} {tab === "selfpay" ? "balance" : "claim"}{selected.size === 1 ? "" : "s"} selected</div><div className="bsub">{money(selTotal)} {tab === "selfpay" ? "owed" : "insurance"}{tab === "selfpay" ? "" : <> · <span className="comm">+{money(comm(selClaims))} to you</span></>}</div></div>
          <div className="sp" />
          {tab !== "selfpay" && <button className="gen" onClick={generateClaims} title="Build CMS-1500 claims for the selected claims">Generate CMS-1500</button>}
          {tab === "tobill" ? (
            <>
              <label>Billed date <input type="date" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} /></label>
              <button className="go" disabled={busy} onClick={() => markBilled([...selected], batchDate)}>{busy ? "Submitting…" : `Mark ${selected.size} billed`}</button>
            </>
          ) : (
            <>
              <label>Collected date <input type="date" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} /></label>
              <button className="go" disabled={busy} onClick={() => markPaid([...selected], batchDate)}>{busy ? "Marking…" : `Mark ${selected.size} collected`}</button>
            </>
          )}
          <button className="x" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}
    </>
  );
}
