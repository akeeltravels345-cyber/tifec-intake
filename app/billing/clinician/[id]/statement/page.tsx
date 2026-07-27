import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingUser, isOwner } from "@/lib/billingRole";
import { listSessions, listInsurers, getClinicianSettings, getPracticeConfig } from "@/lib/billing";
import { computeClinicianMonth, insurancePortion } from "@/lib/billingCalc";
import { getClinician } from "@/lib/clinicians";
import PrintButton from "@/components/billing/PrintButton";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default async function PayoutStatement({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ y?: string; m?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/me");

  const { id } = await params;
  if (!isOwner(user.role) && id !== user.clinician.id) redirect(`/billing/clinician/${user.clinician.id}`);
  const clinician = getClinician(id);
  if (!clinician) redirect("/billing/overview");

  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.y) || now.getUTCFullYear();
  const month = Number(sp.m) || now.getUTCMonth() + 1;
  const key = `${year}-${String(month).padStart(2, "0")}`;

  const [all, insurers, settings, cfg] = await Promise.all([listSessions({ clinicianId: id }), listInsurers(), getClinicianSettings(id), getPracticeConfig()]);
  const c = computeClinicianMonth(all, settings, year, month, cfg.billerCommissionPct);
  const insurerName = (iid: string | null) => insurers.find((i) => i.id === iid)?.name ?? (iid ? "—" : "Self-pay");

  // The insurance payments that actually landed this month (the payout basis, incl. rollover).
  const received = all
    .filter((s) => s.insurancePaid && s.paidDate && s.paidDate.slice(0, 7) === key && insurancePortion(s) > 0)
    .sort((a, b) => (a.paidDate || "").localeCompare(b.paidDate || ""));

  const generated = new Date().toISOString().slice(0, 10);
  const otherDeductions = c.otherDeductionPctAmount + c.healthDeduction;

  return (
    <div className="stmt-wrap">
      <div className="stmt-actions">
        <Link href={`/billing/clinician/${id}?y=${year}&m=${month}`} className="bz-link">← Back</Link>
        <PrintButton />
      </div>

      <article className="stmt">
        <header className="stmt-head">
          <div className="stmt-brand">
            <img src="/tifec-logo.png" alt="The Institute for Essential Care" className="stmt-logo" />
            <div className="stmt-brand-sub">The Institute for Essential Care</div>
          </div>
          <div className="stmt-meta">
            <div className="stmt-doc">Monthly Payout Statement</div>
            <div className="stmt-period">{MONTHS[month - 1]} {year}</div>
            <div className="stmt-gen">Generated {generated} · KYD</div>
          </div>
        </header>

        <section className="stmt-to">
          <div>
            <div className="stmt-label">Prepared for</div>
            <div className="stmt-name">{clinician.name}</div>
            <div className="stmt-cred">{clinician.credentials}</div>
          </div>
          <div className="stmt-net">
            <div className="stmt-label">Net payout</div>
            <div className="stmt-net-val">{money(c.payout)}</div>
          </div>
        </section>

        <section className="stmt-grid">
          <div className="stmt-kpi"><span>Appointments</span><b>{c.appointments}</b></div>
          <div className="stmt-kpi"><span>Revenue generated</span><b>{money(c.revenueGenerated)}</b></div>
          <div className="stmt-kpi"><span>Collected this month</span><b>{money(c.collected)}</b></div>
          <div className="stmt-kpi"><span>Still outstanding</span><b>{money(c.outstanding)}</b></div>
        </section>

        <section>
          <h3 className="stmt-h3">Payout calculation</h3>
          <table className="stmt-calc">
            <tbody>
              <tr><td>Co-pays collected at visits</td><td className="num">{money(c.copayThisMonth)}</td></tr>
              <tr><td>Insurance payments received this month</td><td className="num">{money(c.insuranceBilledThisMonth)}</td></tr>
              <tr className="sub"><td>Collected this month</td><td className="num">{money(c.collected)}</td></tr>
              <tr><td>Company retention ({c.retentionPct}%)</td><td className="num minus">−{money(c.retentionAmount)}</td></tr>
              {c.otherDeductionPct > 0 && <tr><td>Other deduction ({c.otherDeductionPct}%)</td><td className="num minus">−{money(c.otherDeductionPctAmount)}</td></tr>}
              {c.healthDeduction > 0 && <tr><td>Health insurance</td><td className="num minus">−{money(c.healthDeduction)}</td></tr>}
              <tr className="total"><td>Net payout</td><td className="num">{money(c.payout)}</td></tr>
            </tbody>
          </table>
          <p className="stmt-note">Payout is 60% of what was actually collected this month, less deductions. Appointments still awaiting insurance ({money(c.outstanding)} outstanding) will appear on the statement for the month their payment is received.</p>
        </section>

        {received.length > 0 && (
          <section>
            <h3 className="stmt-h3">Insurance payments received this month</h3>
            <table className="stmt-table">
              <thead><tr><th>Paid</th><th>Service date</th><th>Client</th><th>Insurer</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {received.map((s) => (
                  <tr key={s.id}>
                    <td>{s.paidDate}</td>
                    <td>{s.dateOfService}</td>
                    <td>{s.clientId ? <Link href={`/billing/clients/${s.clientId}`} className="bq-clientlink">{s.clientFirst} {s.clientLast}</Link> : `${s.clientFirst} ${s.clientLast}`}</td>
                    <td>{insurerName(s.insurerId)}</td>
                    <td className="num">{money(insurancePortion(s))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <footer className="stmt-foot">
          <span>The Institute for Essential Care · Grand Cayman</span>
          <span>This statement is generated automatically and reflects data as of {generated}.</span>
        </footer>
      </article>
    </div>
  );
}
