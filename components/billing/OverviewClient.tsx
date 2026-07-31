"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;

export interface ClinRow {
  id: string; name: string; role: string; appts: number;
  collected: number; owed: number; payout: number;
  revenueGenerated: number; billed: number; outstandingThisMonth: number; copay: number; uncollectedCopay: number;
}
export interface OverviewData {
  year: number; month: number; monthName: string; prevMonthName: string;
  earned: number; earnedCollected: number; earnedOwed: number; earnedDelta: number | null;
  cashTotal: number; cashCopays: number; cashInsurance: number; cashRollover: number;
  bottom: { cashCollected: number; payouts: number; billerCommission: number; billerFromClinicians: number; billerFromCompany: number; billerCommissionPct: number; runningExpenses: number; net: number; outstanding: number; projectedNet: number; processingFee: number; processingFeePct: number; netAfterProcessing: number };
  isAdmin?: boolean; // the builder/admin sees the platform processing-fee line
  trend: { label: string; value: number; current: boolean }[];
  expenses: { name: string; detail: string; amount: number; breakdown?: { label: string; amount: number }[] }[];
  expensesTotal: number;
  insurers: { name: string; count: number; amount: number; oldestDays: number }[];
  insurersTotal: number;
  clinicians: ClinRow[];
  appointments: number;
  uncollectedCopay: number; // practice-wide co-pays due but not collected this month
}

function TrendChart({ pts }: { pts: { label: string; value: number; current: boolean }[] }) {
  const W = 460, H = 120, pad = 8;
  const max = Math.max(1, ...pts.map((p) => p.value));
  const min = Math.min(...pts.map((p) => p.value)) * 0.85;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / Math.max(1, pts.length - 1);
  const y = (v: number) => H - pad - ((v - min) / Math.max(1, max - min)) * (H - 2 * pad);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`;
  const cur = pts.map((p, i) => ({ p, i })).find((o) => o.p.current);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" style={{ height: 120, overflow: "visible" }} aria-hidden="true">
      <defs><linearGradient id="tgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2F8E93" stopOpacity="0.16" /><stop offset="1" stopColor="#2F8E93" stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill="url(#tgrad)" />
      <path d={line} fill="none" stroke="#2F8E93" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {cur && <circle cx={x(cur.i)} cy={y(cur.p.value)} r="5.5" fill="#fff" stroke="#2E3192" strokeWidth="3" />}
    </svg>
  );
}

export default function OverviewClient({ data }: { data: OverviewData }) {
  const router = useRouter();
  const [sort, setSort] = useState<"collected" | "owed" | "payout">("collected");
  const [open, setOpen] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const go = (y: number, m: number) => router.push(`/billing/overview?y=${y}&m=${m}`);
  const prev = () => (data.month === 1 ? go(data.year - 1, 12) : go(data.year, data.month - 1));
  const next = () => (data.month === 12 ? go(data.year + 1, 1) : go(data.year, data.month + 1));

  const clinicians = useMemo(() => {
    const c = [...data.clinicians];
    c.sort((a, b) => (sort === "owed" ? b.owed - a.owed : sort === "payout" ? b.payout - a.payout : b.collected - a.collected));
    return c;
  }, [data.clinicians, sort]);

  const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
  const insMax = Math.max(1, ...data.insurers.map((i) => i.amount));

  return (
    <>
      <div className="bo-topbar">
        <div>
          <h1 className="bo-h1">Business overview</h1>
          <p className="bo-sub">The whole practice, {data.monthName} {data.year} · amounts in KYD</p>
        </div>
        <div className="bo-toolbar">
          <div className="bo-qa">
            <Link href="/billing/sessions/new" className="bo-qab pri"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>Log a session</Link>
            <button className="bo-qab" onClick={() => setExportOpen(true)}>Export month</button>
            <Link href="#by-clinician" className="bo-qab">Payout statements</Link>
          </div>
          <div className="bo-month">
            <button className="bo-mbtn" onClick={prev} aria-label="Previous month">‹</button>
            <button className="bo-mbtn on">{data.monthName} {data.year}</button>
            <button className="bo-mbtn" onClick={next} aria-label="Next month">›</button>
          </div>
        </div>
      </div>

      {/* Hero: work earned + cash collected */}
      <div className="bo-hero">
        <div className="bo-card">
          <span className="bo-lab">Total charged · {data.monthName}</span>
          <div className="bo-big">{money(data.earned)}
            {data.earnedDelta !== null && <span className="bo-delta">▲ {Math.abs(data.earnedDelta).toFixed(0)}% vs prior</span>}
          </div>
          <div className="bo-segbar">
            <i style={{ width: `${pct(data.earnedCollected, data.earned)}%`, background: "var(--teal)" }} />
            <i style={{ width: `${pct(data.earnedOwed, data.earned)}%`, background: "#D9A441" }} />
          </div>
          <div className="bo-leg">
            <span className="k"><span className="bo-dot" style={{ background: "var(--teal)" }} />Collected <b>{money(data.earnedCollected)}</b></span>
            <span className="k"><span className="bo-dot" style={{ background: "#D9A441" }} />Still owed by insurers <b>{money(data.earnedOwed)}</b></span>
          </div>
          <p className="bo-cap">The total charged for every session delivered this month. These two always add back to what was charged — nothing is hidden.</p>
        </div>

        <div className="bo-card">
          <span className="bo-lab">Cash actually collected · {data.monthName}</span>
          <div className="bo-big">{money(data.cashTotal)}</div>
          <div className="bo-brk">
            <div className="bo-brkrow"><span className="k"><span className="bo-dot" style={{ background: "var(--teal)" }} />Co-pays taken at visits</span><span className="v">{money(data.cashCopays)}</span></div>
            <div className="bo-brkrow"><span className="k"><span className="bo-dot" style={{ background: "var(--indigo)" }} />Insurance payments received</span><span className="v">{money(data.cashInsurance)}</span></div>
            <div className="bo-brkrow"><span className="k sub">↳ of which from earlier months</span><span className="v sub">{money(data.cashRollover)}</span></div>
          </div>
          <p className="bo-cap">Money that truly arrived this month — and the only basis for clinician payouts.</p>
        </div>
      </div>

      <div className="bo-bridge"><span className="line" /><span className="txt">Earned is the work you did · Collected is the cash in the door. They differ by what insurers still owe you.</span><span className="line" /></div>

      {data.uncollectedCopay > 0 && (
        <div className="bo-uncollected">
          <div>
            <span className="lab">Co-pays not collected · {data.monthName}</span>
            <span className="amt">{money(data.uncollectedCopay)}</span>
          </div>
          <p className="note">Co-pays that were due at the visit but weren&apos;t taken across the practice this month — money the practice is missing. See who below.</p>
        </div>
      )}

      {/* Bottom line + trend */}
      <div className="bo-two">
        <div className="bo-card">
          <span className="bo-lab">The bottom line · {data.monthName}</span>
          <div className="bo-wf">
            <div className="bo-wfl"><span className="k">Cash collected</span><span className="v">{money(data.bottom.cashCollected)}</span></div>
            <div className="bo-wfl minus"><span className="k"><span className="bo-dot" style={{ background: "var(--indigo)" }} />Clinician payouts</span><span className="v">−{money(data.bottom.payouts)}</span></div>
            <div className="bo-wfl minus"><span className="k"><span className="bo-dot" style={{ background: "#8b93b8" }} />Biller commission</span><span className="v">−{money(data.bottom.billerCommission)}</span></div>
            {data.bottom.billerFromClinicians > 0 && (
              <div className="bo-wfl bo-wfl-sub"><span className="k">↳ withheld from clinician payouts</span><span className="v">{money(data.bottom.billerFromClinicians)}</span></div>
            )}
            {data.bottom.billerFromCompany > 0 && (
              <div className="bo-wfl bo-wfl-sub"><span className="k">↳ the practice&apos;s own agreement</span><span className="v">{money(data.bottom.billerFromCompany)}</span></div>
            )}
            <div className="bo-wfl minus"><span className="k"><span className="bo-dot" style={{ background: "#D9A441" }} />Running expenses</span><span className="v">−{money(data.bottom.runningExpenses)}</span></div>
            <div className="bo-wftot"><span className="k">Net this month</span><span className="v" style={{ color: data.bottom.net < 0 ? "var(--neg)" : "var(--ink)" }}>{money0(data.bottom.net)}</span></div>
            {data.isAdmin && data.bottom.processingFeePct > 0 && (
              <div className="bo-adminfee">
                <div className="bo-wfl minus"><span className="k"><span className="bo-dot" style={{ background: "#7c5cff" }} />😁 Platform Processing Fee ({data.bottom.processingFeePct}% of collected)</span><span className="v">−{money(data.bottom.processingFee)}</span></div>
                <div className="bo-wftot"><span className="k">Net after processing fee</span><span className="v" style={{ color: data.bottom.netAfterProcessing < 0 ? "var(--neg)" : "var(--ink)" }}>{money0(data.bottom.netAfterProcessing)}</span></div>
                <div className="bo-adminnote">Admin-only — not shown to the owner. Your take this month: <b>{money(data.bottom.processingFee)}</b> ({data.bottom.processingFeePct}% of {money(data.bottom.cashCollected)} collected).</div>
              </div>
            )}
          </div>
          <div className="bo-proj">Projected <b>{money0(data.bottom.projectedNet)}</b> once the {money(data.bottom.outstanding)} still owed by insurers lands (you keep ~{Math.max(0, 100 - 60 - data.bottom.billerCommissionPct)}% of it after payouts).</div>
        </div>

        <div className="bo-card bo-trend">
          <div className="thead">
            <span className="bo-lab">Cash collected · last 6 months</span>
            <div style={{ textAlign: "right" }}><div className="tv">{money(data.cashTotal)}</div><div className="tl">{data.monthName}</div></div>
          </div>
          <TrendChart pts={data.trend} />
          <div className="xr">{data.trend.map((p) => <span key={p.label}>{p.label}</span>)}</div>
        </div>
      </div>

      {/* Running expenses */}
      <div className="bo-card" style={{ marginBottom: 18 }}>
        <div className="bo-secrow" style={{ margin: 0 }}>
          <h3 className="bo-sech">Running expenses</h3>
          <span className="bo-hint">{money(data.expensesTotal)} / month</span>
        </div>
        {data.expenses.map((e) => (
          <div className="bo-exprow" key={e.name}>
            <div><div className="en">{e.name}</div><div className="ew">{e.detail}{e.breakdown ? ` · ${e.breakdown.map((b) => `${b.label} ${money0(b.amount)}`).join(" · ")}` : ""}</div></div>
            <div className="ea">{money(e.amount)}</div>
          </div>
        ))}
      </div>

      {/* Waiting on insurance */}
      <div className="bo-card" style={{ marginBottom: 22 }}>
        <div className="bo-secrow" style={{ margin: "0 0 6px" }}>
          <h3 className="bo-sech">Waiting on insurance</h3>
          <span className="bo-hint">Where your {money(data.insurersTotal)} in outstanding claims is sitting — oldest first</span>
        </div>
        {data.insurers.map((i) => (
          <div className="bo-crow" key={i.name}>
            <div className="ins">{i.name}<small>{i.count} claim{i.count === 1 ? "" : "s"}</small></div>
            <div className="bo-ctrack"><i style={{ width: `${pct(i.amount, insMax)}%` }} /></div>
            <div className="bo-cright">
              <span className={`bo-age ${i.oldestDays >= 15 ? "warn" : ""}`}>oldest {i.oldestDays}d</span>
              <span className="bo-camt">{money(i.amount)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* By clinician */}
      <div className="bo-secrow" id="by-clinician">
        <h3 className="bo-sech">By clinician</h3>
        <div className="bo-sorttabs">
          {(["collected", "owed", "payout"] as const).map((k) => (
            <button key={k} className={`bo-st ${sort === k ? "on" : ""}`} onClick={() => setSort(k)}>{k === "collected" ? "Collected" : k === "owed" ? "Outstanding" : "Payout"}</button>
          ))}
        </div>
      </div>
      <div className="bo-clin">
        {clinicians.map((c) => {
          const total = c.collected + c.owed;
          const isOpen = open === c.id;
          return (
            <div className="bo-clrow" key={c.id}>
              <div className="bo-clhead" onClick={() => setOpen(isOpen ? null : c.id)}>
                <div className="nm">{c.name}<small>{c.appts} appointment{c.appts === 1 ? "" : "s"}</small></div>
                <div>
                  <div className="bo-cltrack"><span className="c" style={{ width: `${pct(c.collected, total)}%` }} /><span className="o" style={{ width: `${pct(c.owed, total)}%` }} /></div>
                  <div className="bo-clcap"><span>{money0(c.collected)} collected</span><span>{c.owed > 0 ? `${money0(c.owed)} outstanding` : "all collected"}</span></div>
                </div>
                <div className="bo-clpay"><div className="p">{money(c.payout)}</div><div className="s">payout</div></div>
                <div className={`bo-chev ${isOpen ? "open" : ""}`}>›</div>
              </div>
              {isOpen && (
                <div className="bo-exp">
                  <div className="bo-expgrid">
                    <div className="bo-expcell"><div className="k">Revenue earned</div><div className="v">{money(c.revenueGenerated)}</div></div>
                    <div className="bo-expcell"><div className="k">Already billed</div><div className="v">{money(c.billed)}</div></div>
                    <div className="bo-expcell"><div className="k">Still outstanding</div><div className="v">{money(c.outstandingThisMonth)}</div></div>
                    <div className="bo-expcell"><div className="k">Collected at visit</div><div className="v">{money(c.copay)}</div></div>
                    <div className="bo-expcell"><div className="k">Co-pays not collected</div><div className="v" style={c.uncollectedCopay > 0 ? { color: "#9a3b2a" } : undefined}>{money(c.uncollectedCopay)}</div></div>
                  </div>
                  <div className="bo-prog"><i style={{ width: `${pct(c.billed, c.revenueGenerated)}%` }} /></div>
                  <p className="bo-expnote"><Link href={`/billing/clinician/${c.id}?y=${data.year}&m=${data.month}`}>Open {c.name}&apos;s full detail →</Link></p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {exportOpen && (
        <div className="bo-modal" onClick={(e) => { if (e.target === e.currentTarget) setExportOpen(false); }}>
          <div className="bo-sheet">
            <div className="bo-sheetbar">
              <div><div className="bo-sheettitle">{data.monthName} {data.year} · month summary</div><div className="bo-sheetsub">The Institute for Essential Care · KYD</div></div>
              <div className="bo-sheetacts">
                <button className="bo-qab" onClick={() => window.print()}>Print / Save PDF</button>
                <button className="bo-close" onClick={() => setExportOpen(false)}>✕</button>
              </div>
            </div>
            <div className="bo-sheetbody">
              <div className="bo-sgrid">
                <div className="bo-scell"><span>Earned</span><b>{money(data.earned)}</b></div>
                <div className="bo-scell"><span>Collected</span><b>{money(data.cashTotal)}</b></div>
                <div className="bo-scell"><span>Outstanding</span><b>{money(data.bottom.outstanding)}</b></div>
                <div className="bo-scell"><span>Appointments</span><b>{data.appointments}</b></div>
              </div>
              <table className="bo-stbl">
                <tbody>
                  <tr><td>Cash collected</td><td className="num">{money(data.bottom.cashCollected)}</td></tr>
                  <tr className="minus"><td>Clinician payouts</td><td className="num">−{money(data.bottom.payouts)}</td></tr>
                  <tr className="minus"><td>Biller commission</td><td className="num">−{money(data.bottom.billerCommission)}</td></tr>
                  <tr className="minus"><td>Running expenses</td><td className="num">−{money(data.bottom.runningExpenses)}</td></tr>
                  <tr className="tot"><td>Net this month</td><td className="num">{money0(data.bottom.net)}</td></tr>
                </tbody>
              </table>
              <div className="bo-shalf">
                <div>
                  <h4 className="bo-sh4">Payout by clinician</h4>
                  {clinicians.filter((c) => c.payout > 0).map((c) => <div className="bo-srow" key={c.id}><span>{c.name}</span><span>{money(c.payout)}</span></div>)}
                </div>
                <div>
                  <h4 className="bo-sh4">Outstanding by insurer</h4>
                  {data.insurers.map((i) => <div className="bo-srow" key={i.name}><span>{i.name}<em>{i.count} claims</em></span><span>{money(i.amount)}</span></div>)}
                </div>
              </div>
              <p className="bo-sfoot">Generated from live billing data. Payout follows cash actually collected this month; outstanding claims pay out the month their insurance settles.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
