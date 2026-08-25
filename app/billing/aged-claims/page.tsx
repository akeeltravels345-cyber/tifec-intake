import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { listSessions, listInsurers } from "@/lib/billing";
import { insurancePortion, insuranceSettled, ageDays } from "@/lib/billingCalc";
import { caymanToday } from "@/lib/caymanTime";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Every insurer that has outstanding (unpaid) claims, with how much is stuck and
// how old the oldest one is. Each links to a printable report for that insurer.
export default async function AgedClaimsIndex() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/aged-claims");
  const isAdmin = user.clinician.contact === "admin";
  if (!isBiller(user.role) && !isOwner(user.role) && !isAdmin) redirect("/billing/me");

  const [sessions, insurers] = await Promise.all([listSessions(), listInsurers()]);
  const today = caymanToday();
  const outstanding = sessions.filter((s) => s.insurerId && !insuranceSettled(s) && insurancePortion(s) > 0);

  const byInsurer = insurers.map((ins) => {
    const claims = outstanding.filter((s) => s.insurerId === ins.id);
    const total = claims.reduce((t, s) => t + insurancePortion(s), 0);
    const aged60 = claims.filter((s) => ageDays(s.dateOfService, today) >= 60);
    const oldest = claims.reduce((m, s) => Math.max(m, ageDays(s.dateOfService, today)), 0);
    return { ins, count: claims.length, total, oldest, aged60Count: aged60.length, aged60Sum: aged60.reduce((t, s) => t + insurancePortion(s), 0) };
  }).filter((x) => x.count > 0).sort((a, b) => b.aged60Sum - a.aged60Sum || b.total - a.total);

  const grandTotal = byInsurer.reduce((t, x) => t + x.total, 0);
  const grandAged = byInsurer.reduce((t, x) => t + x.aged60Sum, 0);

  return (
    <>
      <div className="su-topbar">
        <h1 className="su-h1">Aged insurance claims</h1>
        <p className="su-sub">Outstanding claims by insurer, for follow-up meetings. Open a company to see and print every unpaid claim, oldest first. As of {today}.</p>
      </div>

      <div className="bal-kpis two">
        <div className="bal-kpi"><div className="k">Total outstanding</div><div className="v">{money(grandTotal)}</div></div>
        <div className="bal-kpi"><div className="k">Of that, 60+ days</div><div className="v owe">{money(grandAged)}</div></div>
      </div>

      {byInsurer.length === 0 ? (
        <div className="bq-empty" style={{ padding: 28 }}><div className="big">Nothing outstanding</div><div className="small">Every insurance claim has been settled.</div></div>
      ) : (
        <div className="ac-cards">
          {byInsurer.map((x) => (
            <Link key={x.ins.id} href={`/billing/aged-claims/${x.ins.id}`} className="ac-card">
              <div className="ac-cardhead">
                <div className="ac-cardname">{x.ins.name}</div>
                {x.aged60Count > 0 && <span className="ac-flag">{x.aged60Count} over 60d</span>}
              </div>
              <div className="ac-cardtotal">{money(x.total)}</div>
              <div className="ac-cardmeta">{x.count} {x.count === 1 ? "claim" : "claims"} · oldest {x.oldest} days</div>
              {x.aged60Sum > 0 && <div className="ac-cardaged">{money(x.aged60Sum)} is 60+ days late</div>}
              <div className="ac-cardcta">Open report →</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
