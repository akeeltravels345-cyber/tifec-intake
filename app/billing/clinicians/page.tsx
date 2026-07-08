import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingUser, canSeeBusiness } from "@/lib/billingRole";
import { listSessions, getClinicianSettings } from "@/lib/billing";
import { computeClinicianMonth } from "@/lib/billingCalc";
import { CLINICIANS } from "@/lib/clinicians";
import MonthNav from "@/components/billing/MonthNav";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const w = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

export default async function ClinicianDirectory({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/clinicians");
  if (!canSeeBusiness(user.role)) redirect("/billing/me");

  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.y) || now.getUTCFullYear();
  const month = Number(sp.m) || now.getUTCMonth() + 1;

  const all = await listSessions();
  const settingsList = await Promise.all(CLINICIANS.map((c) => getClinicianSettings(c.id)));
  const rows = CLINICIANS.map((c, i) => ({ c, m: computeClinicianMonth(all.filter((s) => s.clinicianId === c.id), settingsList[i], year, month) }))
    .sort((a, b) => b.m.collected - a.m.collected);

  const totalPayout = rows.reduce((t, r) => t + r.m.payout, 0);

  return (
    <>
      <div className="cd-topbar">
        <div>
          <h1 className="cd-h1">By clinician</h1>
          <p className="cd-sub">Every clinician&apos;s month, {MONTHS[month - 1]} {year} · total payout {money(totalPayout)} · KYD</p>
        </div>
        <MonthNav year={year} month={month} path="/billing/clinicians" />
      </div>

      <div className="bo-clin">
        {rows.map(({ c, m }) => {
          const total = m.collected + m.outstandingThisMonth;
          return (
            <Link key={c.id} href={`/billing/clinician/${c.id}?y=${year}&m=${month}`} className="bo-clrow" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
              <div className="bo-clhead">
                <div className="nm">{c.name}<small>{m.appointments} appointment{m.appointments === 1 ? "" : "s"}{c.billing === "biller" ? " · biller" : c.admin ? " · owner" : ""}</small></div>
                <div>
                  <div className="bo-cltrack"><span className="c" style={{ width: `${w(m.collected, total)}%` }} /><span className="o" style={{ width: `${w(m.outstandingThisMonth, total)}%` }} /></div>
                  <div className="bo-clcap"><span>{money0(m.collected)} collected</span><span>{m.outstandingThisMonth > 0 ? `${money0(m.outstandingThisMonth)} outstanding` : (m.appointments ? "all collected" : "no activity")}</span></div>
                </div>
                <div className="bo-clpay"><div className="p">{money(m.payout)}</div><div className="s">payout</div></div>
                <div className="bo-chev">›</div>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
