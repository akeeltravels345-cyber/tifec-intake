import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingUser, canSeeBusiness } from "@/lib/billingRole";
import { listSessions, getClinicianSettings } from "@/lib/billing";
import { computeClinicianMonth, computeBusinessMonth } from "@/lib/billingCalc";
import { CLINICIANS } from "@/lib/clinicians";
import MonthPicker from "@/components/billing/MonthPicker";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pctWidth = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

// Two-segment donut: payout (indigo) vs company net (teal), as a share of collected.
function Donut({ payoutFrac }: { payoutFrac: number }) {
  const size = 116, stroke = 18, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const payoutLen = Math.max(0, Math.min(1, payoutFrac)) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#319A9F" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2E3192" strokeWidth={stroke}
        strokeDasharray={`${payoutLen} ${c - payoutLen}`} strokeLinecap="butt" />
    </svg>
  );
}

export default async function OwnerOverview({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/overview");
  if (!canSeeBusiness(user.role)) redirect("/billing/me");

  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.y) || now.getUTCFullYear();
  const month = Number(sp.m) || now.getUTCMonth() + 1;
  const prevY = month === 1 ? year - 1 : year;
  const prevM = month === 1 ? 12 : month - 1;

  const allSessions = await listSessions();
  const settingsList = await Promise.all(CLINICIANS.map((c) => getClinicianSettings(c.id)));
  const settingsMap = new Map(CLINICIANS.map((c, i) => [c.id, settingsList[i]]));
  const bizFor = (y: number, m: number) =>
    computeBusinessMonth(
      CLINICIANS.map((c) => computeClinicianMonth(allSessions.filter((s) => s.clinicianId === c.id), settingsMap.get(c.id)!, y, m)),
      y, m
    );
  const biz = bizFor(year, month);
  const prev = bizFor(prevY, prevM);

  const nameOf = (id: string) => CLINICIANS.find((c) => c.id === id)?.name ?? id;
  const rows = biz.perClinician
    .map((c) => ({ c, name: nameOf(c.clinicianId) }))
    .filter(({ c }) => c.appointments > 0 || c.collected > 0 || c.outstanding > 0)
    .sort((a, b) => b.c.collected - a.c.collected);

  const collectedDelta = prev.collected > 0 ? ((biz.collected - prev.collected) / prev.collected) * 100 : null;
  const pipelineTotal = biz.collected + biz.outstanding;
  const payoutFrac = biz.collected > 0 ? biz.totalPayout / biz.collected : 0;

  const deltaChip = collectedDelta === null
    ? null
    : (() => {
        const up = collectedDelta >= 0;
        return <span className={`ov-delta ${Math.abs(collectedDelta) < 0.5 ? "flat" : up ? "up" : "down"}`}>{up ? "▲" : "▼"} {Math.abs(collectedDelta).toFixed(0)}% vs {MONTHS[prevM - 1]}</span>;
      })();

  return (
    <div>
      <div className="ov-headrow">
        <div>
          <h2 className="ov-title">Business overview</h2>
          <p className="ov-sub">The whole practice, at a glance. Amounts in KYD.</p>
        </div>
        <MonthPicker year={year} month={month} path="/billing/overview" />
      </div>

      <div className="ov-hero">
        <div className="ov-card">
          <span className="ov-eyebrow">Collected · {MONTHS[month - 1]} {year}</span>
          <div className="ov-big">{money(biz.collected)}{deltaChip}</div>
          <div className="ov-bar" role="img" aria-label={`${money(biz.collected)} collected, ${money(biz.outstanding)} outstanding`}>
            <span className="seg-c" style={{ width: `${pctWidth(biz.collected, pipelineTotal)}%` }} />
            <span className="seg-o" style={{ width: `${pctWidth(biz.outstanding, pipelineTotal)}%` }} />
          </div>
          <div className="ov-legend">
            <span className="k"><span className="ov-dot c" />Collected&nbsp;<b>{money0(biz.collected)}</b></span>
            <span className="k"><span className="ov-dot o" />Outstanding&nbsp;<b>{money0(biz.outstanding)}</b></span>
            <span className="k"><span className="ov-dot n" />Coming in&nbsp;<b>{money0(biz.revenueGenerated)}</b></span>
          </div>
        </div>

        <div className="ov-card">
          <span className="ov-eyebrow">Where the collected money goes</span>
          <div className="ov-split">
            <div className="ov-donut">
              <Donut payoutFrac={payoutFrac} />
              <div className="ov-donut-center">
                <span className="n">{money0(biz.companyNet)}</span>
                <span className="l">company net</span>
              </div>
            </div>
            <div className="ov-split-legend">
              <div className="ov-li"><span className="k"><span className="ov-dot" style={{ background: "#2E3192" }} />Payout to clinicians</span><div className="v">{money(biz.totalPayout)}</div></div>
              <div className="ov-li"><span className="k"><span className="ov-dot" style={{ background: "#319A9F" }} />Company net</span><div className="v">{money(biz.companyNet)}</div></div>
            </div>
          </div>
        </div>
      </div>

      <div className="ov-strip">
        <div className="ov-stat"><div className="k">Appointments</div><div className="v">{biz.appointments}</div></div>
        <div className="ov-stat"><div className="k">Coming in</div><div className="v">{money0(biz.revenueGenerated)}</div></div>
        <div className="ov-stat"><div className="k">Insurance billed</div><div className="v">{money0(biz.billed)}</div></div>
        <div className="ov-stat"><div className="k">Collected at visit</div><div className="v">{money0(biz.copays)}</div></div>
      </div>

      <div className="ov-clin-head2">
        <h3 className="bz-sec" style={{ margin: 0 }}>By clinician</h3>
        <span className="help" style={{ margin: 0 }}>Tap to see appointments, billed vs outstanding, and payout</span>
      </div>

      {rows.length === 0 ? (
        <div className="card bz-empty">No billing activity for {MONTHS[month - 1]} {year}.</div>
      ) : (
        <div className="ov-clin">
          {rows.map(({ c, name }) => {
            const total = c.collected + c.outstanding;
            return (
              <Link key={c.clinicianId} href={`/billing/clinician/${c.clinicianId}?y=${year}&m=${month}`} className="ov-crow">
                <div className="ov-crow-name">
                  {name}{c.clinicianId === user.clinician.id && <span className="ov-youtag">you</span>}
                  <small>{c.appointments} appointment{c.appointments === 1 ? "" : "s"}</small>
                </div>
                <div className="ov-crow-barwrap">
                  <div className="ov-crow-track" role="img" aria-label={`${money(c.collected)} collected, ${money(c.outstanding)} outstanding`}>
                    <span className="c" style={{ width: `${pctWidth(c.collected, total)}%` }} />
                    <span className="o" style={{ width: `${pctWidth(c.outstanding, total)}%` }} />
                  </div>
                  <div className="cap">
                    <span>{money0(c.collected)} collected</span>
                    <span>{c.outstanding > 0 ? `${money0(c.outstanding)} outstanding` : "all collected"}</span>
                  </div>
                </div>
                <div className="ov-crow-amt">
                  <div className="p">{money(c.payout)}</div>
                  <div className="s">payout</div>
                </div>
                <span className="ov-crow-go" aria-hidden="true">›</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
