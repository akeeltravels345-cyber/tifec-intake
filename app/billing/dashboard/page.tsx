import { redirect } from "next/navigation";
import { getBillingUser, canConfigure } from "@/lib/billingRole";
import { listSessions, getClinicianSettings } from "@/lib/billing";
import { computeDisbursement } from "@/lib/billingCalc";
import { CLINICIANS } from "@/lib/clinicians";
import MonthPicker from "@/components/billing/MonthPicker";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toFixed(2)}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default async function DisbursementDashboard({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/dashboard");
  if (!canConfigure(user.role)) redirect("/billing/sessions");

  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.y) || now.getUTCFullYear();
  const month = Number(sp.m) || now.getUTCMonth() + 1;

  const allSessions = await listSessions();

  const rows = await Promise.all(
    CLINICIANS.map(async (c) => {
      const mine = allSessions.filter((s) => s.clinicianId === c.id);
      const settings = await getClinicianSettings(c.id);
      const d = computeDisbursement(mine, settings, year, month);
      return { clinician: c, d };
    })
  );

  // Only show clinicians with something happening this month (paid, billed, or outstanding).
  const active = rows.filter((r) => r.d.payrollEligibleRevenue > 0 || r.d.billedThisMonth > 0 || r.d.outstanding > 0);

  const totalPaid = active.reduce((t, r) => t + r.d.payrollEligibleRevenue, 0);
  const totalNet = active.reduce((t, r) => t + r.d.netPayout, 0);
  const totalOutstanding = active.reduce((t, r) => t + r.d.outstanding, 0);

  return (
    <div>
      <div className="bz-head">
        <div>
          <h2 className="section-title">Disbursements</h2>
          <p className="section-desc">Payroll counts revenue in the month the insurer <em>paid</em> it. Amounts in KYD.</p>
        </div>
        <MonthPicker year={year} month={month} />
      </div>

      <div className="bz-kpis" style={{ marginBottom: 20 }}>
        <div className="bz-kpi accent">
          <span className="bz-kpi-label">Net payout · {MONTHS[month - 1]} {year}</span>
          <span className="bz-kpi-val">{money(totalNet)}</span>
        </div>
        <div className="bz-kpi">
          <span className="bz-kpi-label">Paid this month</span>
          <span className="bz-kpi-val">{money(totalPaid)}</span>
        </div>
        <div className="bz-kpi">
          <span className="bz-kpi-label">Outstanding (all months)</span>
          <span className="bz-kpi-val">{money(totalOutstanding)}</span>
        </div>
      </div>

      {active.length === 0 ? (
        <div className="card bz-empty">No billing activity for {MONTHS[month - 1]} {year}.</div>
      ) : (
        <div className="bz-disb-list">
          {active.map(({ clinician, d }) => (
            <div className="card bz-disb" key={clinician.id}>
              <div className="bz-disb-head">
                <span className="bz-disb-name">{clinician.name}</span>
                <span className="bz-disb-net">{money(d.netPayout)}<small>net payout</small></span>
              </div>
              <div className="bz-disb-grid">
                <div><span>Paid this month</span><strong>{money(d.payrollEligibleRevenue)}</strong></div>
                <div><span>Retention ({d.retentionPct}%)</span><strong className="minus">−{money(d.retentionAmount)}</strong></div>
                {(d.otherDeductionPct > 0 || d.otherDeductionFixed > 0) && (
                  <div><span>Other deductions</span><strong className="minus">−{money(d.otherDeductionPctAmount + d.otherDeductionFixed)}</strong></div>
                )}
                <div><span>Billed this month</span><strong>{money(d.billedThisMonth)}</strong></div>
              </div>
              <div className="bz-disb-foot">
                {d.rolledOverPaidThisMonth > 0 && (
                  <span className="bz-tagline"><span className="bz-dot rollover" /> {money(d.rolledOverPaidThisMonth)} rolled over from earlier months</span>
                )}
                {d.outstanding > 0 && (
                  <span className="bz-tagline"><span className="bz-dot out" /> {money(d.outstanding)} still outstanding ({d.outstandingSessions.length} session{d.outstandingSessions.length === 1 ? "" : "s"})</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
