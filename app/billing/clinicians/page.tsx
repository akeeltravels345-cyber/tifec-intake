import Link from "next/link";
import { caymanYearMonth } from "@/lib/caymanTime";
import { redirect } from "next/navigation";
import { getBillingUser, canSeeBusiness, isBiller } from "@/lib/billingRole";
import { listSessions, getClinicianSettings, getPracticeConfig, listClinicianSettings, listExternalClinicians, servicesInvoiceTotal, type BillingSession } from "@/lib/billing";
import { computeClinicianMonth } from "@/lib/billingCalc";
import { computeBillerMonth } from "@/lib/billerPayout";
import { CLINICIANS, isSystemAdmin } from "@/lib/clinicians";
import MonthNav from "@/components/billing/MonthNav";
import Foldable from "@/components/billing/Foldable";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const w = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

export default async function ClinicianDirectory({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/clinicians");
  // Owner sees this as the practice snapshot; the biller needs it too, to
  // reconcile each clinician's numbers against what they report.
  if (!canSeeBusiness(user.role) && !isBiller(user.role)) redirect("/billing/me");

  const sp = await searchParams;
  const nowYM = caymanYearMonth();
  const year = Number(sp.y) || nowYM.year;
  const month = Number(sp.m) || nowYM.month;

  const [all, cfg] = await Promise.all([listSessions(), getPracticeConfig()]);
  const settingsList = await Promise.all(CLINICIANS.map((c) => getClinicianSettings(c.id)));
  const rows = CLINICIANS.map((c, i) => ({ c, m: computeClinicianMonth(all.filter((s: BillingSession) => s.clinicianId === c.id), settingsList[i], year, month, c.intakeHidden ? 0 : cfg.billerCommissionPct) }))
    .filter(({ c }) => !c.test) // keep the throwaway test account out of billing
    .sort((a, b) => b.m.collected - a.m.collected);

  const totalPayout = rows.reduce((t, r) => t + r.m.payout, 0);

  // The biller (e.g. Nick) has no clinician collections of their own, so their
  // real payout is the billing commission (less their own pension). Compute it
  // here so their row shows and links to their actual payout, not an empty one.
  const [allSettings, external] = await Promise.all([listClinicianSettings(), listExternalClinicians()]);
  const bm = computeBillerMonth(all, allSettings, external, cfg.billerCommissionPct, year, month);
  const billerClin = CLINICIANS.find((c) => c.billing === "biller");
  const billerPensionPct = allSettings.find((s) => s.clinicianId === billerClin?.id)?.pensionPct ?? 0;
  const billerNet = Math.round((bm.commission * (1 - billerPensionPct / 100)) * 100) / 100;

  // The admin (Akeel) draws no clinical payout — his pay is the fixed monthly
  // services invoice. Show his row with that figure + a link to the invoice,
  // mirroring the owner overview's by-clinician list.
  const servicesTotal = servicesInvoiceTotal(cfg);
  const servicesOn = !!cfg.servicesInvoice?.enabled && servicesTotal > 0;

  return (
    <>
      <div className="cd-topbar">
        <div>
          <h1 className="cd-h1">By clinician</h1>
          <p className="cd-sub">Every clinician&apos;s month, {MONTHS[month - 1]} {year} · total payout {money(totalPayout)} · KYD</p>
        </div>
        <MonthNav year={year} month={month} path="/billing/clinicians" />
      </div>

      <Foldable rowSelector=".bo-clrow" unit="clinicians">
      <div className="bo-clin">
        {rows.map(({ c, m }) => {
          // The biller's real payout is their commission (less pension); the admin's
          // (Akeel) is the fixed monthly services invoice. Both link to their own
          // document rather than an empty clinical-payout page.
          const isBiller = c.billing === "biller";
          const isAdminSvc = isSystemAdmin(c) && servicesOn;
          const href = isAdminSvc ? `/billing/services-invoice?y=${year}&m=${month}`
            : isBiller ? `/billing/biller/statement?y=${year}&m=${month}`
            : `/billing/clinician/${c.id}?y=${year}&m=${month}`;
          const payout = isAdminSvc ? servicesTotal : isBiller ? billerNet : m.payout;
          const total = m.collected + m.outstandingThisMonth;
          return (
            <Link key={c.id} href={href} className="bo-clrow" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
              <div className="bo-clhead">
                <div className="nm">{c.name}<small>{isAdminSvc ? "monthly services" : isBiller ? "biller" : `${m.appointments} appointment${m.appointments === 1 ? "" : "s"}${c.admin ? " · owner" : ""}`}</small></div>
                {isAdminSvc ? (
                  <div>
                    <div className="bo-clcap" style={{ marginTop: 6 }}><span>Fixed monthly services fee</span><span style={{ color: "var(--teal, #2E8E93)", fontWeight: 600 }}>View invoice →</span></div>
                  </div>
                ) : isBiller ? (
                  <div>
                    <div className="bo-cltrack"><span className="c" style={{ width: bm.commission > 0 ? "100%" : "0%" }} /></div>
                    <div className="bo-clcap"><span>{money0(bm.commission)} commission earned</span><span>{bm.billedCount} claim{bm.billedCount === 1 ? "" : "s"} processed</span></div>
                  </div>
                ) : (
                  <div>
                    <div className="bo-cltrack"><span className="c" style={{ width: `${w(m.collected, total)}%` }} /><span className="o" style={{ width: `${w(m.outstandingThisMonth, total)}%` }} /></div>
                    <div className="bo-clcap"><span>{money0(m.collected)} collected</span><span>{m.outstandingThisMonth > 0 ? `${money0(m.outstandingThisMonth)} outstanding` : (m.appointments ? "all collected" : "no activity")}</span></div>
                  </div>
                )}
                <div className="bo-clpay"><div className="p">{money(payout)}</div><div className="s">{isAdminSvc ? "services" : isBiller ? "biller payout" : "payout"}</div></div>
                <div className="bo-chev">›</div>
              </div>
            </Link>
          );
        })}
      </div>
      </Foldable>
    </>
  );
}
