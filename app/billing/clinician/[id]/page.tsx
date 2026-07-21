import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingUser, isOwner } from "@/lib/billingRole";
import { listSessions, listInsurers, getClinicianSettings, getPracticeConfig } from "@/lib/billing";
import { computeClinicianMonth, insurancePortion } from "@/lib/billingCalc";
import { getClinician } from "@/lib/clinicians";
import MonthNav from "@/components/billing/MonthNav";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const w = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const initials = (name: string) => { const p = name.replace(/^(Dr\.?|Mrs\.?|Mr\.?|Ms\.?|Miss)\s+/i, "").trim().split(/\s+/); return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); };

export default async function ClinicianDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ y?: string; m?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/me");

  const { id } = await params;
  if (!isOwner(user.role) && id !== user.clinician.id) redirect(`/billing/clinician/${user.clinician.id}`);
  const clinician = getClinician(id);
  if (!clinician) redirect(isOwner(user.role) ? "/billing/overview" : "/billing/me");

  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.y) || now.getUTCFullYear();
  const month = Number(sp.m) || now.getUTCMonth() + 1;

  const [all, insurers, settings, cfg] = await Promise.all([listSessions({ clinicianId: id }), listInsurers(), getClinicianSettings(id), getPracticeConfig()]);
  const c = computeClinicianMonth(all, settings, year, month, cfg.billerCommissionPct);
  const insurerName = (iid: string | null) => insurers.find((i) => i.id === iid)?.name ?? (iid ? "—" : "Self-pay");
  const isSelf = id === user.clinician.id;
  const visits = [...c.visitSessions].sort((a, b) => b.dateOfService.localeCompare(a.dateOfService));
  const otherDeductions = c.otherDeductionPctAmount + c.healthDeduction;

  return (
    <>
      {isOwner(user.role) && <Link href={`/billing/overview?y=${year}&m=${month}`} className="cd-back">← Back to overview</Link>}
      <div className="cd-topbar">
        <div className="cd-idrow">
          <div className="cd-avatar">{initials(clinician.name)}</div>
          <div>
            <h1 className="cd-h1">{clinician.name}</h1>
            <p className="cd-sub">{clinician.credentials} · {MONTHS[month - 1]} {year} · KYD</p>
          </div>
        </div>
        <MonthNav year={year} month={month} path={`/billing/clinician/${id}`} />
      </div>

      <div className="cd-kpis">
        <div className="cd-kpi"><div className="k">Appointments logged</div><div className="v">{c.appointments}</div></div>
        <div className="cd-kpi"><div className="k">Total earned</div><div className="v">{money0(c.revenueGenerated)}</div></div>
        <div className="cd-kpi"><div className="k">Collected</div><div className="v">{money0(c.collected)}</div></div>
        <div className="cd-kpi"><div className="k">Outstanding</div><div className="v owe">{money0(c.outstanding)}</div></div>
      </div>

      <div className="cd-two">
        <div className="cd-card">
          <span className="cd-lab">Payout · {MONTHS[month - 1]}</span>
          <div className="cd-flowbar">
            <i style={{ width: `${w(c.payout, c.collected)}%`, background: "var(--indigo)" }} />
            <i style={{ width: `${w(c.retentionAmount, c.collected)}%`, background: "#8b93b8" }} />
            <i style={{ width: `${w(otherDeductions, c.collected)}%`, background: "#D9A441" }} />
          </div>
          <div className="cd-flowline"><span className="lbl"><span className="cd-keydot" style={{ background: "#EEE7DB" }} />Collected this month</span><span className="amt">{money(c.collected)}</span></div>
          <div className="cd-flowline minus"><span className="lbl"><span className="cd-keydot" style={{ background: "#8b93b8" }} />Company retention ({c.retentionPct}%)</span><span className="amt">−{money(c.retentionAmount)}</span></div>
          {c.otherDeductionPct > 0 && <div className="cd-flowline minus"><span className="lbl"><span className="cd-keydot" style={{ background: "#D9A441" }} />Other ({c.otherDeductionPct}%)</span><span className="amt">−{money(c.otherDeductionPctAmount)}</span></div>}
          {c.healthDeduction > 0 && <div className="cd-flowline minus"><span className="lbl"><span className="cd-keydot" style={{ background: "#D9A441" }} />Health insurance</span><span className="amt">−{money(c.healthDeduction)}</span></div>}
          <div className="cd-rtotal"><span className="k"><span className="cd-keydot" style={{ background: "var(--indigo)" }} />Net payout</span><span className="v">{money(c.payout)}</span></div>
          <p className="cd-note">Payout follows the cash actually collected this month. Appointments still awaiting insurance pay out the month their payment arrives.</p>
          <Link href={`/billing/clinician/${id}/statement?y=${year}&m=${month}`} className="cd-stmt">🧾 View payout statement →</Link>
        </div>

        <div className="cd-card">
          <span className="cd-lab">This month&apos;s work</span>
          <div className="cd-workhead"><span style={{ fontSize: 13, color: "var(--muted)" }}>Billed vs coming in</span><span style={{ fontSize: 13, fontWeight: 700 }}>{money0(c.billedFromThisMonth)} of {money0(c.revenueGenerated)}</span></div>
          <div className="cd-prog"><i style={{ width: `${w(c.billedFromThisMonth, c.revenueGenerated)}%` }} /></div>
          <div className="cd-flowline"><span className="lbl">Revenue generated</span><span className="amt">{money(c.revenueGenerated)}</span></div>
          <div className="cd-flowline"><span className="lbl">Already billed</span><span className="amt">{money(c.billedFromThisMonth)}</span></div>
          <div className="cd-flowline"><span className="lbl">Still outstanding</span><span className="amt">{money(c.outstandingThisMonth)}</span></div>
          <div className="cd-flowline"><span className="lbl">Collected at visit</span><span className="amt">{money(c.copayThisMonth)}</span></div>
        </div>
      </div>

      <div className="cd-secrow">
        <h3 className="cd-sech">Sessions in {MONTHS[month - 1]}</h3>
        {isSelf && <Link href="/billing/sessions/new" className="cd-stmt" style={{ marginTop: 0 }}>+ Log a session</Link>}
      </div>
      <div className="cd-card" style={{ padding: "10px 14px" }}>
        {visits.length === 0 ? (
          <div className="cd-empty">No appointments logged for this month.</div>
        ) : (
          <div className="cd-tblwrap">
            <table className="cd-tbl">
              <thead><tr><th>Date</th><th>Client</th><th>Code</th><th className="num">Fee</th><th className="num">Co-pay</th><th className="num">Insurance</th><th>Status</th></tr></thead>
              <tbody>
                {visits.map((s) => (
                  <tr key={s.id}>
                    <td>{s.dateOfService}</td>
                    <td className="nm">{s.clientFirst} {s.clientLast}</td>
                    <td>{s.cptCodes.join(", ") || "—"}</td>
                    <td className="num">{money(s.totalCost)}</td>
                    <td className="num">{money(s.copayCollected)}</td>
                    <td className="num">{money(insurancePortion(s))}</td>
                    <td>{!s.insurerId ? <span className="cd-pill self">Self-pay</span> : s.insurancePaid ? <span className="cd-pill paid">Billed</span> : <span className="cd-pill pend">Outstanding</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
