import Link from "next/link";
import { caymanToday, caymanYearMonth } from "@/lib/caymanTime";
import { redirect } from "next/navigation";
import { getBillingUser, isOwner, isBiller } from "@/lib/billingRole";
import { listSessions, listClinicianSettings, listExternalClinicians, getPracticeConfig } from "@/lib/billing";
import { computeBillerMonth } from "@/lib/billerPayout";
import { CLINICIANS, isSystemAdmin } from "@/lib/clinicians";
import PrintButton from "@/components/billing/PrintButton";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// The biller's monthly payout statement. Their payout is the commission on what
// was actually COLLECTED this month; pending is shown separately. Biller sees
// their own; owner/admin for oversight.
export default async function BillerPayoutStatement({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/biller/statement");
  if (!isBiller(user.role) && !isOwner(user.role) && !isSystemAdmin(user.clinician)) redirect("/billing/me");

  const sp = await searchParams;
  const nowYM = caymanYearMonth();
  const year = Number(sp.y) || nowYM.year;
  const month = Number(sp.m) || nowYM.month;

  const [all, settingsList, external, cfg] = await Promise.all([listSessions(), listClinicianSettings(), listExternalClinicians(), getPracticeConfig()]);
  const bm = computeBillerMonth(all, settingsList, external, cfg.billerCommissionPct, year, month);

  const generated = caymanToday();
  const biller = CLINICIANS.find((c) => c.billing === "biller");
  const clinRows = bm.byClinician.filter((c) => c.cut > 0);
  const hasCompany = bm.company.cut > 0;

  // The biller can also carry a pension (e.g. Nick, who is a practicum clinician
  // too). It's a % of their earnings — the commission — taken from THEIR Setup
  // pension rate. Net payout is the commission less that pension.
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const pensionPct = (biller ? settingsList.find((s) => s.clinicianId === biller.id)?.pensionPct : 0) ?? 0;
  const pension = r2((bm.commission * pensionPct) / 100);
  const netPayout = r2(bm.commission - pension);

  return (
    <div className="stmt-wrap">
      <div className="stmt-actions">
        <Link href={`/billing/biller?y=${year}&m=${month}`} className="bz-link">← Back</Link>
        <PrintButton />
      </div>

      <article className="stmt">
        <header className="stmt-head">
          <div className="stmt-brand">
            <img src="/tifec-logo.png" alt="The Institute for Essential Care" className="stmt-logo" />
            <div className="stmt-brand-sub">The Institute for Essential Care</div>
          </div>
          <div className="stmt-meta">
            <div className="stmt-doc">Biller Payout Statement</div>
            <div className="stmt-period">{MONTHS[month - 1]} {year}</div>
            <div className="stmt-gen">Generated {generated} · KYD</div>
          </div>
        </header>

        <section className="stmt-to">
          <div>
            <div className="stmt-label">Prepared for</div>
            <div className="stmt-name">{biller?.name ?? "Biller"}</div>
            <div className="stmt-cred">{biller?.credentials ?? "Billing"}</div>
          </div>
          <div className="stmt-net">
            <div className="stmt-label">Net payout</div>
            <div className="stmt-net-val">{money(netPayout)}</div>
          </div>
        </section>

        <section className="stmt-grid">
          <div className="stmt-kpi"><span>Insurance collected</span><b>{money(bm.insuranceCollected)}</b></div>
          <div className="stmt-kpi"><span>Claims paid</span><b>{bm.billedCount}</b></div>
          <div className="stmt-kpi"><span>Blended rate</span><b>{bm.blendedRate}</b></div>
        </section>

        <section>
          <h3 className="stmt-h3">Where your payout came from</h3>
          <p className="stmt-sub">Each clinician&apos;s biller rate on their Setup biller-base (their share of the insurance the rate is charged on), plus {bm.billerRate}% of the company retention where commission applies. Based on money actually collected this month.</p>
          <table className="stmt-calc">
            <tbody>
              {clinRows.length === 0 && !hasCompany ? (
                <tr><td>No commission collected this month</td><td className="num">{money(0)}</td></tr>
              ) : (
                <>
                  {clinRows.map((c) => (
                    <tr key={c.id}><td>{c.name} ({c.pct}% of {money(c.base)})</td><td className="num">{money(c.cut)}</td></tr>
                  ))}
                  {hasCompany && (
                    <tr><td>Company retention ({bm.billerRate}% of {money(bm.company.retained)} retained)</td><td className="num">{money(bm.company.cut)}</td></tr>
                  )}
                </>
              )}
              <tr className="sub"><td>Commission earned</td><td className="num">{money(bm.commission)}</td></tr>
              {pension > 0 && <tr><td>Pension ({pensionPct}% of earnings)</td><td className="num minus">−{money(pension)}</td></tr>}
              <tr className="total"><td>Net payout</td><td className="num">{money(netPayout)}</td></tr>
            </tbody>
          </table>
        </section>

        <footer className="stmt-foot">
          <span>The Institute for Essential Care · Grand Cayman</span>
          <span>This statement is generated automatically and reflects data as of {generated}.</span>
        </footer>
      </article>
    </div>
  );
}
