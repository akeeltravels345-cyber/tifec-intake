import Link from "next/link";
import { caymanToday, caymanYearMonth } from "@/lib/caymanTime";
import { redirect } from "next/navigation";
import { getBillingUser, canMarkBilled } from "@/lib/billingRole";
import { listSessions, listInsurers, listClinicianSettings, listExternalClinicians, getPracticeConfig } from "@/lib/billing";
import { insurancePortion, ageDays } from "@/lib/billingCalc";
import { getClinician, CLINICIANS } from "@/lib/clinicians";
import MonthNav from "@/components/billing/MonthNav";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const r2 = (n: number) => Math.round(n * 100) / 100;

export default async function BillerHome({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/biller");
  if (!canMarkBilled(user.role)) redirect("/billing/me");

  const sp = await searchParams;
  const nowYM = caymanYearMonth();
  const year = Number(sp.y) || nowYM.year;
  const month = Number(sp.m) || nowYM.month;
  const today = caymanToday();
  const key = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
  const mKey = key(year, month);
  const prevY = month === 1 ? year - 1 : year, prevM = month === 1 ? 12 : month - 1;

  const [all, insurerList, settingsList, external, cfg] = await Promise.all([listSessions(), listInsurers(), listClinicianSettings(), listExternalClinicians(), getPracticeConfig()]);
  // TIFEC clinicians pay the biller two ways, both out of the company's share:
  // a practice-wide % of the COMPANY RETENTION, plus an individual % agreed for
  // that clinician. Outside clinicians aren't on TIFEC's books, so they just
  // carry their own rate on what's collected for them.
  const billerRate = cfg.billerCommissionPct;
  const settingsOf = (cid: string) => settingsList.find((s) => s.clinicianId === cid);
  const retentionPctOf = (cid: string) => settingsOf(cid)?.retentionPct ?? 0;
  const directPctOf = (cid: string) => settingsOf(cid)?.billerPct ?? 0;
  const externalOf = (cid: string) => external.find((c) => c.id === cid);
  // Commission is earned on real clinicians and outside clients only. The
  // admin/test account is not a clinician anyone is billed for, and it's hidden
  // from the breakdown below — so it must not earn either, or the headline
  // figure would stop matching the rows that explain it.
  const earnsCommission = (cid: string) =>
    !!externalOf(cid) || CLINICIANS.some((c) => c.id === cid && !c.intakeHidden);
  const comm = (s: (typeof all)[number]) => {
    if (!earnsCommission(s.clinicianId)) return 0;
    const ins = insurancePortion(s);
    const e = externalOf(s.clinicianId);
    if (e) return (ins * e.billerPct) / 100;
    const fromCompany = (ins * (retentionPctOf(s.clinicianId) / 100) * billerRate) / 100;
    const fromClinician = (ins * directPctOf(s.clinicianId)) / 100;
    return fromCompany + fromClinician;
  };
  /** The rate shown on a row: their own % for an outside client, or for a TIFEC
   *  clinician the combined cut of collections — their individual % plus the
   *  practice % of retention. */
  const effRateOf = (cid: string) => {
    const e = externalOf(cid);
    if (e) return e.billerPct;
    const combined = directPctOf(cid) + (retentionPctOf(cid) / 100) * billerRate;
    return Math.round(combined * 100) / 100;
  };
  const insName = (id: string | null) =>
    insurerList.find((i) => i.id === id)?.name ?? (id ? "Unknown insurer" : "Self-pay");
  const clinName = (id: string) => getClinician(id)?.name ?? external.find((c) => c.id === id)?.name ?? id;
  const sum = (arr: typeof all, f: (s: (typeof all)[number]) => number) => r2(arr.reduce((t, s) => t + f(s), 0));

  const billedThisMonth = all.filter((s) => s.insurancePaid && s.paidDate?.slice(0, 7) === mKey && insurancePortion(s) > 0);
  const insuranceCollected = sum(billedThisMonth, insurancePortion);
  const commission = sum(billedThisMonth, comm);
  const prevCollected = sum(all.filter((s) => s.insurancePaid && s.paidDate?.slice(0, 7) === key(prevY, prevM)), insurancePortion);
  const commDelta = prevCollected > 0 ? ((insuranceCollected - prevCollected) / prevCollected) * 100 : null;

  const unbilled = all.filter((s) => s.insurerId && !s.insurancePaid && insurancePortion(s) > 0);
  const outstanding = sum(unbilled, insurancePortion);
  const pendingCommission = sum(unbilled, comm);
  // Rates differ per clinician, so the headline rate is what the mix actually
  // worked out to this month, not a number anyone configured.
  const blendedRate = `${(insuranceCollected > 0 ? (commission / insuranceCollected) * 100 : 0).toFixed(1)}%`;

  // who owes you — outstanding per insurer (with your commission on it)
  const map = new Map<string, { name: string; amount: number; count: number; oldest: number; toYou: number }>();
  for (const s of unbilled) {
    const cur = map.get(s.insurerId!) ?? { name: insName(s.insurerId), amount: 0, count: 0, oldest: 0, toYou: 0 };
    cur.amount = r2(cur.amount + insurancePortion(s)); cur.count++; cur.oldest = Math.max(cur.oldest, ageDays(s.dateOfService, today)); cur.toYou = r2(cur.toYou + comm(s));
    map.set(s.insurerId!, cur);
  }
  const byInsurer = [...map.values()].sort((a, b) => b.amount - a.amount);

  // where your commission came from — earnings per clinician this month.
  // Outside clients are disabled for now, so only the practice's own clinicians.
  const roster = CLINICIANS.filter((c) => !c.intakeHidden && c.billing !== "biller").map((c) => ({ id: c.id, name: c.name, external: false }));
  const byClinician = roster.map((c) => {
    const billed = billedThisMonth.filter((s) => s.clinicianId === c.id);
    const open = unbilled.filter((s) => s.clinicianId === c.id);
    return {
      id: c.id, name: c.name, external: c.external, pct: effRateOf(c.id), claims: billed.length,
      collected: sum(billed, insurancePortion), cut: sum(billed, comm),
      pending: sum(open, comm), outstanding: sum(open, insurancePortion),
    };
  }).filter((c) => c.collected > 0 || c.outstanding > 0).sort((a, b) => b.cut - a.cut);
  const cutMax = Math.max(1, ...byClinician.map((c) => c.cut));

  // recent claims marked billed (activity log)
  const recent = all.filter((s) => s.insurancePaid && s.paidDate && insurancePortion(s) > 0)
    .sort((a, b) => (b.paidDate || "").localeCompare(a.paidDate || "")).slice(0, 8);

  // 6-month insurance-collected trend
  const trend = Array.from({ length: 6 }, (_, k) => {
    let m = month - 5 + k, y = year; while (m <= 0) { m += 12; y -= 1; }
    return { label: SHORT[m - 1], value: sum(all.filter((s) => s.insurancePaid && s.paidDate?.slice(0, 7) === key(y, m)), insurancePortion), current: m === month && y === year };
  });
  // Sparkline, sized to sit in the hero's third zone.
  const tMax = Math.max(1, ...trend.map((p) => p.value)), tMin = Math.min(...trend.map((p) => p.value)) * 0.82;
  const SW = 220, SH = 52;
  const sx = (i: number) => Number((4 + (i * (SW - 8)) / 5).toFixed(1));
  const sy = (v: number) => Number((SH - 5 - ((v - tMin) / Math.max(1, tMax - tMin)) * (SH - 12)).toFixed(1));
  const sparkLine = trend.map((p, i) => `${i === 0 ? "M" : "L"}${sx(i)},${sy(p.value)}`).join(" ");
  const sparkArea = `${sparkLine} L${sx(5)},${SH - 5} L${sx(0)},${SH - 5} Z`;

  const pctW = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

  return (
    <>
      <div className="bq-topbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className="bq-h1">Your month</h1>
          <p className="bq-sub">{user.clinician.name} · what you&apos;ve earned and what&apos;s still owed · {MONTHS[month - 1]} {year} · KYD</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <MonthNav year={year} month={month} path="/billing/biller" />
          <Link href="/billing/payments" className="bl-cta">Open billing queue →</Link>
        </div>
      </div>

      {/* Commission statement: the figure, the ledger behind it, and the trend. */}
      <div className="dh-hero">
        <div className="dh-main">
          <div className="dh-lab">Your commission · {MONTHS[month - 1]}</div>
          <div className="dh-big">{money(commission)}</div>
          <p className="dh-cap">
            Your cut of <b>{money0(insuranceCollected)}</b> collected across {billedThisMonth.length} claim{billedThisMonth.length === 1 ? "" : "s"}.
            {pendingCommission > 0 && <> <b>+{money0(pendingCommission)}</b> is still to come once the open claims are paid.</>}
          </p>
        </div>
        <div className="dh-ledger">
          <div className="dh-row">
            <span className="rl">Insurance collected</span>
            <span className="rv">{money0(insuranceCollected)}
              {commDelta !== null && <em style={{ color: commDelta >= 0 ? "#8fe0c4" : "#f0b8a8" }}>{commDelta >= 0 ? "▲" : "▼"} {Math.abs(commDelta).toFixed(0)}%</em>}
            </span>
          </div>
          <div className="dh-row"><span className="rl">Pending · {unbilled.length} open</span><span className="rv">+{money0(pendingCommission)}</span></div>
          <div className="dh-row"><span className="rl">Blended rate</span><span className="rv">{blendedRate}</span></div>
        </div>
        <div className="dh-spark">
          <div className="dh-sparklab">6-month trend</div>
          <svg viewBox={`0 0 ${SW} ${SH}`} width="100%" preserveAspectRatio="none" style={{ height: 52, overflow: "visible" }} aria-hidden="true">
            <path d={sparkArea} fill="rgba(255,255,255,.14)" />
            <path d={sparkLine} fill="none" stroke="#8fe0c4" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={sx(5)} cy={sy(insuranceCollected)} r="4.5" fill="#fff" stroke="#8fe0c4" strokeWidth="3" />
          </svg>
          <div className="dh-sparkx"><span>{trend[0].label}</span><span>{trend[5].label}</span></div>
        </div>
      </div>

      <div className="bo-split">
        {/* where your commission came from */}
        <div className="bo-card">
          <div className="bo-secrow" style={{ margin: "0 0 6px" }}>
            <span className="bo-lab">Where your cut came from</span>
          </div>
          <p className="bo-hint" style={{ margin: "0 2px 6px" }}>your {money0(commission)} this month · each clinician&apos;s own rate plus {billerRate}% of what the company retains</p>
          {byClinician.length === 0 ? <p className="bo-hint" style={{ padding: "12px 0" }}>No activity yet this month.</p> : byClinician.map((c) => (
            <div className="bo-crow" key={c.id}>
              <div className="ins">{c.name}{c.external && <span className="bl-out">Outside</span>}<small><span className="bl-rate">{c.pct}%</span> {c.claims} claim{c.claims === 1 ? "" : "s"}</small></div>
              <div className="bo-ctrack teal"><i style={{ width: `${pctW(c.cut, cutMax)}%` }} /></div>
              <div className="bo-cright">
                <span className="bo-hint" style={{ whiteSpace: "nowrap" }}>{money0(c.collected)} collected</span>
                <span className="bo-camt">{money(c.cut)}</span>
                <span className="bl-toyou" style={{ minWidth: 92 }}>{c.pending > 0 ? `+${money0(c.pending)} pending` : "—"}</span>
              </div>
            </div>
          ))}
        </div>

        {/* who owes you */}
        <div className="bo-card">
          <div className="bo-secrow" style={{ margin: "0 0 8px" }}><span className="bo-lab">Who owes you</span></div>
          <p className="bo-hint" style={{ margin: "0 2px 8px" }}>{money0(outstanding)} outstanding · chase the oldest first</p>
          {byInsurer.length === 0 ? <p className="bo-hint" style={{ padding: "12px 0" }}>Nothing outstanding — all caught up.</p> : byInsurer.map((i) => (
            <div className="bo-crow" key={i.name} style={{ gridTemplateColumns: "1fr auto" }}>
              <div className="ins">{i.name}<small>{i.count} claim{i.count === 1 ? "" : "s"} · <span className={`bq-age ${i.oldest >= 15 ? "warn" : ""}`}>oldest {i.oldest}d</span></small></div>
              <div className="bo-cright"><span className="bo-camt">{money(i.amount)}</span><span className="bl-toyou">+{money0(i.toYou)}</span></div>
            </div>
          ))}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--hair)" }}>
            <Link href="/billing/payments" className="bl-ghost">Reconcile in the billing queue →</Link>
          </div>
        </div>
      </div>

      {/* recent activity */}
      <div className="bo-secrow" style={{ marginTop: 22 }}><h3 className="bo-sech">Recently marked billed</h3><span className="bo-hint">Your last reconciliations</span></div>
      <div className="bo-card" style={{ padding: "8px 16px" }}>
        {recent.length === 0 ? <div className="bq-empty">Nothing billed yet this period.</div> : (
          <div className="cd-tblwrap"><table className="cd-tbl">
            <thead><tr><th>Paid</th><th>Client</th><th>Clinician</th><th>Insurer</th><th className="num">Amount</th><th className="num">Your cut</th></tr></thead>
            <tbody>
              {recent.map((s) => (
                <tr key={s.id}>
                  <td>{s.paidDate}</td>
                  <td className="nm">{s.clientId ? <Link href={`/billing/clients/${s.clientId}`} className="bq-clientlink">{s.clientFirst} {s.clientLast}</Link> : `${s.clientFirst} ${s.clientLast}`}</td>
                  <td>{clinName(s.clinicianId)}</td>
                  <td>{insName(s.insurerId)}</td>
                  <td className="num">{money(insurancePortion(s))}</td>
                  <td className="num" style={{ color: "#2c7a55", fontWeight: 700 }}>+{money(r2(comm(s)))}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
