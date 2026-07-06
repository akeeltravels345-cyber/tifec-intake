import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingUser, canSeeBusiness } from "@/lib/billingRole";
import { listSessions, getClinicianSettings } from "@/lib/billing";
import { computeClinicianMonth, computeBusinessMonth } from "@/lib/billingCalc";
import { CLINICIANS } from "@/lib/clinicians";
import MonthPicker from "@/components/billing/MonthPicker";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default async function OwnerOverview({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/overview");
  if (!canSeeBusiness(user.role)) redirect("/billing/me");

  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.y) || now.getUTCFullYear();
  const month = Number(sp.m) || now.getUTCMonth() + 1;

  const allSessions = await listSessions();
  const perClinician = await Promise.all(
    CLINICIANS.map(async (c) => {
      const mine = allSessions.filter((s) => s.clinicianId === c.id);
      const settings = await getClinicianSettings(c.id);
      return computeClinicianMonth(mine, settings, year, month);
    })
  );
  const biz = computeBusinessMonth(perClinician, year, month);

  const nameOf = (id: string) => CLINICIANS.find((c) => c.id === id)?.name ?? id;
  // Show clinicians with any activity this month (or money still owed to the practice).
  const rows = biz.perClinician
    .map((c) => ({ c, name: nameOf(c.clinicianId) }))
    .filter(({ c }) => c.appointments > 0 || c.collected > 0 || c.outstanding > 0)
    .sort((a, b) => b.c.collected - a.c.collected);

  return (
    <div>
      <div className="bz-head">
        <div>
          <h2 className="section-title">Business overview</h2>
          <p className="section-desc">Everything across the practice for {MONTHS[month - 1]} {year}. Amounts in KYD.</p>
        </div>
        <MonthPicker year={year} month={month} path="/billing/overview" />
      </div>

      <div className="bz-kpis bz-kpis-lg">
        <div className="bz-kpi accent">
          <span className="bz-kpi-label">Collected this month</span>
          <span className="bz-kpi-val">{money(biz.collected)}</span>
          <span className="bz-kpi-sub">money actually in</span>
        </div>
        <div className="bz-kpi">
          <span className="bz-kpi-label">Coming in this month</span>
          <span className="bz-kpi-val">{money(biz.revenueGenerated)}</span>
          <span className="bz-kpi-sub">{biz.appointments} appointment{biz.appointments === 1 ? "" : "s"}</span>
        </div>
        <div className="bz-kpi">
          <span className="bz-kpi-label">Outstanding</span>
          <span className="bz-kpi-val">{money(biz.outstanding)}</span>
          <span className="bz-kpi-sub">waiting on insurance</span>
        </div>
      </div>

      <div className="bz-kpis" style={{ marginTop: 12, marginBottom: 24 }}>
        <div className="bz-kpi soft">
          <span className="bz-kpi-label">Insurance billed</span>
          <span className="bz-kpi-val sm">{money(biz.billed)}</span>
        </div>
        <div className="bz-kpi soft">
          <span className="bz-kpi-label">Collected at visit</span>
          <span className="bz-kpi-val sm">{money(biz.copays)}</span>
        </div>
        <div className="bz-kpi soft">
          <span className="bz-kpi-label">Payout to clinicians</span>
          <span className="bz-kpi-val sm">{money(biz.totalPayout)}</span>
        </div>
        <div className="bz-kpi soft">
          <span className="bz-kpi-label">Company net</span>
          <span className="bz-kpi-val sm">{money(biz.companyNet)}</span>
        </div>
      </div>

      <h3 className="bz-sec">By clinician</h3>
      <p className="help" style={{ marginTop: -4 }}>Tap a clinician to see their appointments, what&apos;s billed vs outstanding, and their payout.</p>

      {rows.length === 0 ? (
        <div className="card bz-empty">No billing activity for {MONTHS[month - 1]} {year}.</div>
      ) : (
        <div className="bz-clin-list">
          <div className="bz-clin-row bz-clin-head">
            <span>Clinician</span>
            <span className="num">Appts</span>
            <span className="num">Coming in</span>
            <span className="num">Collected</span>
            <span className="num">Outstanding</span>
            <span className="num">Payout</span>
            <span aria-hidden="true" />
          </div>
          {rows.map(({ c, name }) => (
            <Link key={c.clinicianId} href={`/billing/clinician/${c.clinicianId}?y=${year}&m=${month}`} className="bz-clin-row">
              <span className="bz-clin-name">{name}{c.clinicianId === user.clinician.id && <em className="bz-you">you</em>}</span>
              <span className="num">{c.appointments}</span>
              <span className="num">{money(c.revenueGenerated)}</span>
              <span className="num strong">{money(c.collected)}</span>
              <span className="num">{c.outstanding > 0 ? <span className="bz-out">{money(c.outstanding)}</span> : money(0)}</span>
              <span className="num strong brand">{money(c.payout)}</span>
              <span className="bz-clin-go" aria-hidden="true">›</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
