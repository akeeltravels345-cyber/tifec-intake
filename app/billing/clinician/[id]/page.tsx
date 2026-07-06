import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingUser, isOwner } from "@/lib/billingRole";
import { listSessions, listInsurers, getClinicianSettings } from "@/lib/billing";
import { computeClinicianMonth, insurancePortion } from "@/lib/billingCalc";
import { getClinician } from "@/lib/clinicians";
import MonthPicker from "@/components/billing/MonthPicker";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const w = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

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

  const [all, insurers, settings] = await Promise.all([listSessions({ clinicianId: id }), listInsurers(), getClinicianSettings(id)]);
  const c = computeClinicianMonth(all, settings, year, month);
  const insurerName = (iid: string | null) => insurers.find((i) => i.id === iid)?.name ?? (iid ? "—" : "Self-pay");

  const isSelf = id === user.clinician.id;
  const backHref = isOwner(user.role) ? `/billing/overview?y=${year}&m=${month}` : null;
  const visits = [...c.visitSessions].sort((a, b) => b.dateOfService.localeCompare(a.dateOfService));

  const otherDeductions = c.otherDeductionPctAmount + c.healthDeduction;

  return (
    <div>
      <div className="ov-headrow">
        <div>
          {backHref && <Link href={backHref} className="bz-link bz-back">← Back to overview</Link>}
          <h2 className="ov-title">{clinician.name}{isSelf && <span className="ov-youtag">you</span>}</h2>
          <p className="ov-sub">{clinician.credentials} · {MONTHS[month - 1]} {year} · KYD</p>
        </div>
        <MonthPicker year={year} month={month} path={`/billing/clinician/${id}`} />
      </div>

      <div className="ov-strip">
        <div className="ov-stat"><div className="k">Appointments</div><div className="v">{c.appointments}</div></div>
        <div className="ov-stat"><div className="k">Coming in</div><div className="v">{money0(c.revenueGenerated)}</div></div>
        <div className="ov-stat"><div className="k">Collected</div><div className="v">{money0(c.collected)}</div></div>
        <div className="ov-stat"><div className="k">Outstanding</div><div className="v">{money0(c.outstanding)}</div></div>
      </div>

      <div className="bz-two">
        <div className="ov-card">
          <span className="ov-eyebrow">Payout · {MONTHS[month - 1]}</span>
          <div className="ov-flow" style={{ marginTop: 14 }} role="img" aria-label="how collected money splits">
            <span className="f-payout" style={{ width: `${w(c.payout, c.collected)}%` }} />
            <span className="f-ret" style={{ width: `${w(c.retentionAmount, c.collected)}%` }} />
            <span className="f-health" style={{ width: `${w(otherDeductions, c.collected)}%` }} />
          </div>
          <div className="ov-rline"><span className="k"><span className="ov-dotkey" style={{ background: "#eef1f2", border: "1px solid #cbd5db" }} />Collected this month</span><span className="v">{money(c.collected)}</span></div>
          <div className="ov-rline"><span className="k"><span className="ov-dotkey" style={{ background: "#8b93b8" }} />Company retention ({c.retentionPct}%)</span><span className="v minus">−{money(c.retentionAmount)}</span></div>
          {c.otherDeductionPct > 0 && (
            <div className="ov-rline"><span className="k"><span className="ov-dotkey" style={{ background: "#f0b429" }} />Other ({c.otherDeductionPct}%)</span><span className="v minus">−{money(c.otherDeductionPctAmount)}</span></div>
          )}
          {c.healthDeduction > 0 && (
            <div className="ov-rline"><span className="k"><span className="ov-dotkey" style={{ background: "#f0b429" }} />Health insurance</span><span className="v minus">−{money(c.healthDeduction)}</span></div>
          )}
          <div className="ov-rtotal"><span className="k"><span className="ov-dotkey" style={{ background: "#2E3192" }} />Clinician payout</span><span className="v">{money(c.payout)}</span></div>
          <p className="ov-keeps">The practice keeps {money(c.companyKeeps)} from {clinician.name.split(" ").slice(-1)} this month. Payout follows money actually collected, so unpaid appointments pay out the month insurance settles them.</p>
        </div>

        <div className="ov-card">
          <span className="ov-eyebrow">This month&apos;s work</span>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 10 }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Billed vs coming in</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{money0(c.billedFromThisMonth)} of {money0(c.revenueGenerated)}</span>
          </div>
          <div className="ov-prog" role="img" aria-label="billed portion of this month"><span style={{ width: `${w(c.billedFromThisMonth, c.revenueGenerated)}%` }} /></div>
          <div style={{ marginTop: 16 }}>
            <div className="ov-rline"><span className="k">Revenue generated</span><span className="v">{money(c.revenueGenerated)}</span></div>
            <div className="ov-rline"><span className="k">Already billed</span><span className="v">{money(c.billedFromThisMonth)}</span></div>
            <div className="ov-rline"><span className="k">Still outstanding</span><span className="v">{money(c.outstandingThisMonth)}</span></div>
            <div className="ov-rline"><span className="k">Collected at visit</span><span className="v">{money(c.copayThisMonth)}</span></div>
          </div>
        </div>
      </div>

      <div className="ov-clin-head2" style={{ marginTop: 22 }}>
        <h3 className="bz-sec" style={{ margin: 0 }}>Sessions in {MONTHS[month - 1]}</h3>
        {isSelf && <Link href="/billing/sessions/new" className="primary bz-sm" style={{ textDecoration: "none" }}>+ Log a session</Link>}
      </div>
      <div className="ov-card" style={{ padding: 0, overflow: "hidden" }}>
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
