import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingUser, isOwner } from "@/lib/billingRole";
import { listSessions, listInsurers, getClinicianSettings } from "@/lib/billing";
import { computeClinicianMonth, insurancePortion } from "@/lib/billingCalc";
import { getClinician } from "@/lib/clinicians";
import MonthPicker from "@/components/billing/MonthPicker";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default async function ClinicianDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ y?: string; m?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/me");

  const { id } = await params;
  // Clinicians can only see themselves; owners can see anyone.
  if (!isOwner(user.role) && id !== user.clinician.id) redirect(`/billing/clinician/${user.clinician.id}`);

  const clinician = getClinician(id);
  if (!clinician) redirect(isOwner(user.role) ? "/billing/overview" : "/billing/me");

  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.y) || now.getUTCFullYear();
  const month = Number(sp.m) || now.getUTCMonth() + 1;

  const [all, insurers, settings] = await Promise.all([listSessions({ clinicianId: id }), listInsurers(), getClinicianSettings(id)]);
  const c = computeClinicianMonth(all, settings, year, month);
  const insurerName = (iid: string | null) => insurers.find((i) => i.id === iid)?.name ?? (iid ? "—" : "Self-pay");

  const isSelf = id === user.clinician.id;
  const backHref = isOwner(user.role) ? `/billing/overview?y=${year}&m=${month}` : null;

  const visits = [...c.visitSessions].sort((a, b) => b.dateOfService.localeCompare(a.dateOfService));

  return (
    <div>
      <div className="bz-head">
        <div>
          {backHref && <Link href={backHref} className="bz-link bz-back">← Back to overview</Link>}
          <h2 className="section-title">{clinician.name}{isSelf && <em className="bz-you">you</em>}</h2>
          <p className="section-desc">{MONTHS[month - 1]} {year}. Amounts in KYD.</p>
        </div>
        <MonthPicker year={year} month={month} path={`/billing/clinician/${id}`} />
      </div>

      <div className="bz-kpis">
        <div className="bz-kpi">
          <span className="bz-kpi-label">Appointments</span>
          <span className="bz-kpi-val">{c.appointments}</span>
        </div>
        <div className="bz-kpi">
          <span className="bz-kpi-label">Coming in</span>
          <span className="bz-kpi-val">{money(c.revenueGenerated)}</span>
          <span className="bz-kpi-sub">revenue for these appointments</span>
        </div>
        <div className="bz-kpi accent">
          <span className="bz-kpi-label">Collected this month</span>
          <span className="bz-kpi-val">{money(c.collected)}</span>
          <span className="bz-kpi-sub">co-pays + insurance paid</span>
        </div>
        <div className="bz-kpi">
          <span className="bz-kpi-label">Outstanding</span>
          <span className="bz-kpi-val">{money(c.outstanding)}</span>
          <span className="bz-kpi-sub">waiting on insurance</span>
        </div>
      </div>

      <div className="bz-two">
        <div className="card bz-payout">
          <h3 className="bz-sec">Payout for {MONTHS[month - 1]}</h3>
          <div className="bz-payout-line"><span>Collected this month</span><strong>{money(c.collected)}</strong></div>
          <div className="bz-payout-line minus"><span>Company retention ({c.retentionPct}%)</span><strong>−{money(c.retentionAmount)}</strong></div>
          {c.otherDeductionPct > 0 && (
            <div className="bz-payout-line minus"><span>Other ({c.otherDeductionPct}%)</span><strong>−{money(c.otherDeductionPctAmount)}</strong></div>
          )}
          {c.healthDeduction > 0 && (
            <div className="bz-payout-line minus"><span>Health insurance</span><strong>−{money(c.healthDeduction)}</strong></div>
          )}
          <div className="bz-payout-line total"><span>Clinician payout</span><strong>{money(c.payout)}</strong></div>
          <p className="help">The practice keeps {money(c.companyKeeps)} from this clinician this month. Payout follows money actually collected, so unpaid appointments pay out the month insurance settles them.</p>
        </div>

        <div className="card bz-thismonth">
          <h3 className="bz-sec">This month&apos;s appointments</h3>
          <div className="bz-payout-line"><span>Revenue generated</span><strong>{money(c.revenueGenerated)}</strong></div>
          <div className="bz-payout-line"><span>Already billed</span><strong>{money(c.billedFromThisMonth)}</strong></div>
          <div className="bz-payout-line"><span>Still outstanding</span><strong>{money(c.outstandingThisMonth)}</strong></div>
          <div className="bz-payout-line"><span>Collected at visit</span><strong>{money(c.copayThisMonth)}</strong></div>
        </div>
      </div>

      <div className="bz-head" style={{ marginTop: 8 }}>
        <h3 className="bz-sec" style={{ margin: 0 }}>Sessions in {MONTHS[month - 1]}</h3>
        {isSelf && <Link href="/billing/sessions/new" className="primary bz-sm" style={{ textDecoration: "none" }}>+ Log a session</Link>}
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {visits.length === 0 ? (
          <div className="bz-empty">No appointments logged for this month.</div>
        ) : (
          <table className="bz-table">
            <thead>
              <tr><th>Date</th><th>Client</th><th>Insurer</th><th className="num">Fee</th><th className="num">Co-pay</th><th className="num">Insurance</th><th>Status</th></tr>
            </thead>
            <tbody>
              {visits.map((s) => (
                <tr key={s.id}>
                  <td>{s.dateOfService}</td>
                  <td>{s.clientFirst} {s.clientLast}</td>
                  <td>{insurerName(s.insurerId)}</td>
                  <td className="num">{money(s.totalCost)}</td>
                  <td className="num">{money(s.copayCollected)}</td>
                  <td className="num">{money(insurancePortion(s))}</td>
                  <td>
                    {!s.insurerId ? <span className="badge bz-pill-paid">Self-pay</span>
                      : s.insurancePaid ? <span className="badge bz-pill-paid">Billed{s.paidDate ? ` · ${s.paidDate}` : ""}</span>
                      : <span className="badge bz-pill-pending">Outstanding</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
