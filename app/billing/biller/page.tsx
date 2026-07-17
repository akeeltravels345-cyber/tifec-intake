import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingUser, canMarkBilled } from "@/lib/billingRole";
import { listSessions, listInsurers, listClinicianSettings } from "@/lib/billing";
import { insurancePortion, ageDays, AGING_BUCKETS, agingBucketIndex } from "@/lib/billingCalc";
import { getClinician } from "@/lib/clinicians";
import MonthNav from "@/components/billing/MonthNav";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const r2 = (n: number) => Math.round(n * 100) / 100;
const BUCKET_DOT = ["#2c7a55", "#D9A441", "#C98A2B", "#a5432f"];

export default async function BillerHome({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/biller");
  if (!canMarkBilled(user.role)) redirect("/billing/me");

  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.y) || now.getUTCFullYear();
  const month = Number(sp.m) || now.getUTCMonth() + 1;
  const today = now.toISOString().slice(0, 10);
  const key = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
  const mKey = key(year, month);
  const prevY = month === 1 ? year - 1 : year, prevM = month === 1 ? 12 : month - 1;

  const [all, insurerList, settingsList] = await Promise.all([listSessions(), listInsurers(), listClinicianSettings()]);
  // Biller commission is set PER CLINICIAN (e.g. 10% on the owner's collections, 7% on others).
  const billerPctOf = (cid: string) => settingsList.find((s) => s.clinicianId === cid)?.billerPct ?? 0;
  const comm = (s: (typeof all)[number]) => (insurancePortion(s) * billerPctOf(s.clinicianId)) / 100;
  const insName = (id: string | null) => insurerList.find((i) => i.id === id)?.name ?? "—";
  const sum = (arr: typeof all, f: (s: (typeof all)[number]) => number) => r2(arr.reduce((t, s) => t + f(s), 0));

  const billedThisMonth = all.filter((s) => s.insurancePaid && s.paidDate?.slice(0, 7) === mKey && insurancePortion(s) > 0);
  const insuranceCollected = sum(billedThisMonth, insurancePortion);
  const commission = sum(billedThisMonth, comm);
  const prevCollected = sum(all.filter((s) => s.insurancePaid && s.paidDate?.slice(0, 7) === key(prevY, prevM)), insurancePortion);
  const commDelta = prevCollected > 0 ? ((insuranceCollected - prevCollected) / prevCollected) * 100 : null;

  const unbilled = all.filter((s) => s.insurerId && !s.insurancePaid && insurancePortion(s) > 0);
  const outstanding = sum(unbilled, insurancePortion);
  const pendingCommission = sum(unbilled, comm);
  const oldest = unbilled.length ? Math.max(...unbilled.map((s) => ageDays(s.dateOfService, today))) : 0;

  // aging buckets of what's outstanding
  const buckets = AGING_BUCKETS.map((b) => ({ label: b.label, amount: 0, count: 0 }));
  for (const s of unbilled) { const i = agingBucketIndex(ageDays(s.dateOfService, today)); if (i >= 0) { buckets[i].amount += insurancePortion(s); buckets[i].count++; } }
  buckets.forEach((b) => (b.amount = r2(b.amount)));

  // who owes you — outstanding per insurer (with your commission on it)
  const map = new Map<string, { name: string; amount: number; count: number; oldest: number; toYou: number }>();
  for (const s of unbilled) {
    const cur = map.get(s.insurerId!) ?? { name: insName(s.insurerId), amount: 0, count: 0, oldest: 0, toYou: 0 };
    cur.amount = r2(cur.amount + insurancePortion(s)); cur.count++; cur.oldest = Math.max(cur.oldest, ageDays(s.dateOfService, today)); cur.toYou = r2(cur.toYou + comm(s));
    map.set(s.insurerId!, cur);
  }
  const byInsurer = [...map.values()].sort((a, b) => b.amount - a.amount);
  const insMax = Math.max(1, ...byInsurer.map((i) => i.amount));

  // recent claims marked billed (activity log)
  const recent = all.filter((s) => s.insurancePaid && s.paidDate && insurancePortion(s) > 0)
    .sort((a, b) => (b.paidDate || "").localeCompare(a.paidDate || "")).slice(0, 8);

  // 6-month insurance-collected trend
  const trend = Array.from({ length: 6 }, (_, k) => {
    let m = month - 5 + k, y = year; while (m <= 0) { m += 12; y -= 1; }
    return { label: SHORT[m - 1], value: sum(all.filter((s) => s.insurancePaid && s.paidDate?.slice(0, 7) === key(y, m)), insurancePortion), current: m === month && y === year };
  });
  const tMax = Math.max(1, ...trend.map((p) => p.value)), tMin = Math.min(...trend.map((p) => p.value)) * 0.85;
  const TW = 460, TH = 96, x = (i: number) => 6 + (i * (TW - 12)) / 5, ty = (v: number) => TH - 6 - ((v - tMin) / Math.max(1, tMax - tMin)) * (TH - 12);
  const line = trend.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${ty(p.value).toFixed(1)}`).join(" ");
  const cur = trend.map((p, i) => ({ p, i })).find((o) => o.p.current);

  const pctW = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

  return (
    <>
      <div className="bq-topbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className="bq-h1">Biller dashboard</h1>
          <p className="bq-sub">{user.clinician.name} · {MONTHS[month - 1]} {year} · commission set per clinician · KYD</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <MonthNav year={year} month={month} path="/billing/biller" />
          <Link href="/billing/payments" className="bl-cta">Open billing queue →</Link>
        </div>
      </div>

      {/* earnings hero */}
      <div className="bq-hero">
        <div className="bq-comm">
          <div className="cl">Your commission · {MONTHS[month - 1]}</div>
          <div className="cv">{money(commission)}</div>
          <div className="cs">Your cut of the <b>{money0(insuranceCollected)}</b> you&apos;ve marked billed. <b>+{money0(pendingCommission)}</b> waiting on the {byInsurer.reduce((t, i) => t + i.count, 0)} open claims.</div>
        </div>
        <div className="bq-kpi"><div className="k">Insurance collected</div><div className="v">{money0(insuranceCollected)}{commDelta !== null && <span className="bo-delta" style={{ fontSize: 11, marginLeft: 8 }}>{commDelta >= 0 ? "▲" : "▼"} {Math.abs(commDelta).toFixed(0)}%</span>}</div></div>
        <div className="bq-kpi"><div className="k">Claims billed</div><div className="v">{billedThisMonth.length}</div></div>
        <div className="bq-kpi"><div className="k">Oldest open claim</div><div className={`v ${oldest >= 15 ? "warn" : ""}`}>{oldest} days</div></div>
      </div>

      {/* aging buckets */}
      <div className="bq-buckets">
        {buckets.map((b, i) => (
          <Link key={b.label} href="/billing/payments" className="bq-bucket">
            <div className="bk"><span className="bkd" style={{ background: BUCKET_DOT[i] }} />{b.label}</div>
            <div className="bv">{money0(b.amount)}</div>
            <div className="bc">{b.count} claim{b.count === 1 ? "" : "s"}</div>
          </Link>
        ))}
      </div>

      <div className="bo-two">
        {/* who owes you */}
        <div className="bo-card">
          <div className="bo-secrow" style={{ margin: "0 0 8px" }}>
            <span className="bo-lab">Who owes you</span>
            <span className="bo-hint">{money0(outstanding)} outstanding · chase the oldest first</span>
          </div>
          {byInsurer.length === 0 ? <p className="bo-hint" style={{ padding: "12px 0" }}>Nothing outstanding — all caught up. 🎉</p> : byInsurer.map((i) => (
            <div className="bo-crow" key={i.name}>
              <div className="ins">{i.name}<small>{i.count} claim{i.count === 1 ? "" : "s"}</small></div>
              <div className="bo-ctrack"><i style={{ width: `${pctW(i.amount, insMax)}%` }} /></div>
              <div className="bo-cright">
                <span className={`bo-age ${i.oldest >= 15 ? "warn" : ""}`}>oldest {i.oldest}d</span>
                <span className="bo-camt">{money(i.amount)}</span>
                <span className="bl-toyou">+{money0(i.toYou)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* trend */}
        <div className="bo-card bo-trend">
          <div className="thead">
            <span className="bo-lab">Insurance collected · last 6 months</span>
            <div style={{ textAlign: "right" }}><div className="tv">{money0(insuranceCollected)}</div><div className="tl">{MONTHS[month - 1]}</div></div>
          </div>
          <svg viewBox={`0 0 ${TW} ${TH}`} width="100%" preserveAspectRatio="none" style={{ height: 96, overflow: "visible", marginTop: 12 }} aria-hidden="true">
            <path d={`${line} L${x(5).toFixed(1)},${TH - 6} L${x(0).toFixed(1)},${TH - 6} Z`} fill="rgba(47,142,147,.13)" />
            <path d={line} fill="none" stroke="#2F8E93" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {cur && <circle cx={x(cur.i)} cy={ty(cur.p.value)} r="5" fill="#fff" stroke="#2E3192" strokeWidth="3" />}
          </svg>
          <div className="xr">{trend.map((p) => <span key={p.label}>{p.label}</span>)}</div>
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
                  <td className="nm">{s.clientFirst} {s.clientLast}</td>
                  <td>{getClinician(s.clinicianId)?.name ?? s.clinicianId}</td>
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
