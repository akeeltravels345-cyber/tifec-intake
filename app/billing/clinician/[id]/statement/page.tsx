import Link from "next/link";
import { caymanToday, caymanYearMonth } from "@/lib/caymanTime";
import { redirect } from "next/navigation";
import { getBillingUser, isOwner, isBiller } from "@/lib/billingRole";
import { listSessions, getClinicianSettings, getPracticeConfig } from "@/lib/billing";
import { computeClinicianMonth } from "@/lib/billingCalc";
import { getClinician, CLINICIANS } from "@/lib/clinicians";
import PrintButton from "@/components/billing/PrintButton";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "–";

export default async function PayoutStatement({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ y?: string; m?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/me");

  const { id } = await params;
  if (!isOwner(user.role) && !isBiller(user.role) && id !== user.clinician.id) redirect(`/billing/clinician/${user.clinician.id}`);
  const clinician = getClinician(id);
  if (!clinician) redirect("/billing/overview");

  const sp = await searchParams;
  const nowYM = caymanYearMonth();
  const year = Number(sp.y) || nowYM.year;
  const month = Number(sp.m) || nowYM.month;

  const [all, settings, cfg] = await Promise.all([listSessions({ clinicianId: id }), getClinicianSettings(id), getPracticeConfig()]);
  const c = computeClinicianMonth(all, settings, year, month, cfg.billerCommissionPct);

  const generated = caymanToday();
  // The biller who takes the clinician's individual % off their insurance collected.
  const biller = CLINICIANS.find((x) => x.billing === "biller");

  return (
    <div className="stmt-wrap">
      <div className="stmt-actions">
        <Link href={`/billing/clinician/${id}?y=${year}&m=${month}`} className="bz-link">← Back</Link>
        <PrintButton />
      </div>

      <article className="stmt">
        <div className="stmt-band">
          <div className="stmt-band-l">
            <div className="stmt-mono">{initials(clinician.name)}</div>
            <div>
              <div className="stmt-name2">{clinician.name}</div>
              <div className="stmt-doc2">{clinician.credentials}</div>
            </div>
          </div>
          <div className="stmt-band-r">
            <div className="stmt-kind">Monthly Payout Statement</div>
            <div className="stmt-sub2">{MONTHS[month - 1]} {year}</div>
            <div className="stmt-sub2">Generated {generated} · KYD</div>
          </div>
        </div>

        <div className="stmt-body">
          <div className="stmt-hero">
            <span className="stmt-herolab">Net payout</span>
            <span className="stmt-heroval">{money(c.payout)}</span>
          </div>

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
                {c.billerFromClinician > 0 && <tr><td>Billing{biller ? ` · ${biller.name}` : ""} ({c.billerPct}%)</td><td className="num minus">−{money(c.billerFromClinician)}</td></tr>}
                {c.otherDeductionPct > 0 && <tr><td>Other deduction ({c.otherDeductionPct}%)</td><td className="num minus">−{money(c.otherDeductionPctAmount)}</td></tr>}
                {c.healthDeduction > 0 && <tr><td>Health insurance</td><td className="num minus">−{money(c.healthDeduction)}</td></tr>}
                {c.pension > 0 && <tr><td>Pension ({c.pensionPct}% of after-retention share)</td><td className="num minus">−{money(c.pension)}</td></tr>}
                <tr className="total"><td>Net payout</td><td className="num">{money(c.payout)}</td></tr>
              </tbody>
            </table>
          </section>

          <footer className="stmt-foot">
            <span>The Institute for Essential Care · Grand Cayman</span>
            <span>This statement is generated automatically and reflects data as of {generated}.</span>
          </footer>
        </div>
      </article>
    </div>
  );
}
