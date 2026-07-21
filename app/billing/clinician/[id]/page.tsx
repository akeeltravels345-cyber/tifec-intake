import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingUser, isOwner } from "@/lib/billingRole";
import { listSessions, listInsurers, getClinicianSettings, getPracticeConfig } from "@/lib/billing";
import { computeClinicianMonth, insurancePortion, ageDays } from "@/lib/billingCalc";
import { getClinician, CLINICIANS } from "@/lib/clinicians";
import MonthNav from "@/components/billing/MonthNav";
import ClinicianSessions, { type SessionRow } from "@/components/billing/ClinicianSessions";

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
  const insurerName = (iid: string | null) =>
    insurers.find((i) => i.id === iid)?.name ?? (iid ? "Unknown insurer" : "Self-pay");
  const isSelf = id === user.clinician.id;
  const visits = [...c.visitSessions].sort((a, b) => b.dateOfService.localeCompare(a.dateOfService));
  const otherDeductions = c.otherDeductionPctAmount + c.healthDeduction;
  // The clinician's own agreement with the biller — settled from their share,
  // so it is a genuine deduction here (the company's separate 3% is not).
  const biller = CLINICIANS.find((x) => x.billing === "biller");

  // Rows for the sessions table. `history` is every appointment this clinician
  // has logged, so clicking a client can show their whole run of visits — not
  // just the ones inside the month being viewed.
  const toRow = (s: (typeof all)[number]): SessionRow => ({
    id: s.id,
    date: s.dateOfService,
    client: `${s.clientFirst} ${s.clientLast}`.trim(),
    codes: s.cptCodes.join(", "),
    fee: s.totalCost,
    copay: s.copayCollected,
    insurance: insurancePortion(s),
    status: !s.insurerId ? "self" : s.insurancePaid ? "paid" : "pend",
  });

  // What's still with the insurers. This is the clinician's future pay — payout
  // follows cash, so this is the "when do I get the rest" question answered.
  const today = new Date().toISOString().slice(0, 10);
  const owedMap = new Map<string, { name: string; amount: number; count: number; oldest: number }>();
  for (const s of c.outstandingSessions) {
    const k = s.insurerId ?? "self";
    const cur = owedMap.get(k) ?? { name: insurerName(s.insurerId), amount: 0, count: 0, oldest: 0 };
    cur.amount += insurancePortion(s);
    cur.count += 1;
    cur.oldest = Math.max(cur.oldest, ageDays(s.dateOfService, today));
    owedMap.set(k, cur);
  }
  const owed = [...owedMap.values()].sort((a, b) => b.amount - a.amount);
  const owedMax = Math.max(1, ...owed.map((o) => o.amount));

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
        {/* Money taken at the appointment itself: the co-pay on an insured
            visit, or the whole fee when the client is self-pay. Sits with the
            insurance figures, since together they are the cash that arrived. */}
        <div className="cd-kpi"><div className="k">Collected at visit</div><div className="v">{money0(c.copayThisMonth)}</div></div>
        <div className="cd-kpi"><div className="k">Insurance collected</div><div className="v">{money0(c.insuranceBilledThisMonth)}</div></div>
        <div className="cd-kpi"><div className="k">Insurance outstanding</div><div className="v owe">{money0(c.outstanding)}</div></div>
      </div>

      <div className="cd-two">
        <div className="cd-card">
          <span className="cd-lab">Payout · {MONTHS[month - 1]}</span>
          <div className="cd-flowbar">
            <i style={{ width: `${w(c.payout, c.collected)}%`, background: "var(--indigo)" }} />
            <i style={{ width: `${w(c.retentionAmount, c.collected)}%`, background: "#8b93b8" }} />
            <i style={{ width: `${w(c.billerFromClinician, c.collected)}%`, background: "#43A9AE" }} />
            <i style={{ width: `${w(otherDeductions, c.collected)}%`, background: "#D9A441" }} />
          </div>
          <div className="cd-flowline"><span className="lbl"><span className="cd-keydot" style={{ background: "#EEE7DB" }} />Collected this month</span><span className="amt">{money(c.collected)}</span></div>
          <div className="cd-flowline minus"><span className="lbl"><span className="cd-keydot" style={{ background: "#8b93b8" }} />Company retention ({c.retentionPct}%)</span><span className="amt">−{money(c.retentionAmount)}</span></div>
          {c.billerFromClinician > 0 && (
            <div className="cd-flowline minus">
              <span className="lbl"><span className="cd-keydot" style={{ background: "#43A9AE" }} />Billing{biller ? ` · ${biller.name}` : ""} ({c.billerPct}%)</span>
              <span className="amt">−{money(c.billerFromClinician)}</span>
            </div>
          )}
          {c.otherDeductionPct > 0 && <div className="cd-flowline minus"><span className="lbl"><span className="cd-keydot" style={{ background: "#D9A441" }} />Other ({c.otherDeductionPct}%)</span><span className="amt">−{money(c.otherDeductionPctAmount)}</span></div>}
          {c.healthDeduction > 0 && <div className="cd-flowline minus"><span className="lbl"><span className="cd-keydot" style={{ background: "#D9A441" }} />Health insurance</span><span className="amt">−{money(c.healthDeduction)}</span></div>}
          <div className="cd-rtotal"><span className="k"><span className="cd-keydot" style={{ background: "var(--indigo)" }} />Net payout</span><span className="v">{money(c.payout)}</span></div>
          <p className="cd-note">
            Payout follows the cash actually collected this month. Appointments still awaiting insurance pay out the month their payment arrives.
            {c.billerFromClinician > 0 && <> Billing is your own {c.billerPct}% agreement with {biller ? biller.name : "the biller"}, charged on the {money0(c.insuranceBilledThisMonth)} of insurance collected for you.</>}
          </p>
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

          <div className="cd-owed">
            <div className="cd-owedhead">
              <span className="cd-lab">Still to come</span>
              <span className="cd-hint">{owed.length > 0 ? `${money0(c.outstanding)} with insurers` : "nothing outstanding"}</span>
            </div>
            {owed.length === 0 ? (
              <p className="cd-note" style={{ margin: 0 }}>Every appointment you&apos;ve logged has been paid. Nothing is waiting on an insurer.</p>
            ) : (
              <>
                {owed.slice(0, 4).map((o) => (
                  <div className="cd-owedrow" key={o.name}>
                    <span className="nm">{o.name}<small>{o.count} claim{o.count === 1 ? "" : "s"}</small></span>
                    <span className="tr"><i style={{ width: `${w(o.amount, owedMax)}%` }} /></span>
                    <span className={`cd-age ${o.oldest >= 30 ? "warn" : ""}`}>{o.oldest}d</span>
                    <span className="amt">{money0(o.amount)}</span>
                  </div>
                ))}
                {owed.length > 4 && <p className="cd-hint" style={{ margin: "8px 2px 0" }}>+{owed.length - 4} more insurer{owed.length - 4 === 1 ? "" : "s"}</p>}
                <p className="cd-note" style={{ marginTop: 12 }}>These pay out in the month the insurer settles them, not the month of the appointment.</p>
              </>
            )}
          </div>
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
          <ClinicianSessions
            month={visits.map(toRow)}
            history={all.map(toRow)}
            monthLabel={MONTHS[month - 1]}
          />
        )}
      </div>
    </>
  );
}
