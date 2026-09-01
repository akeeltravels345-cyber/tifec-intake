import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingUser, isOwner, isBiller } from "@/lib/billingRole";
import { listSessions, listInsurers, getClinicianSettings, getPracticeConfig, listCptCodes, codeSummary } from "@/lib/billing";
import { caymanToday, caymanYearMonth } from "@/lib/caymanTime";
import { computeClinicianMonth, insurancePortion, ageDays } from "@/lib/billingCalc";
import { listClients } from "@/lib/clients";
import { referralStatus } from "@/lib/referral";
import { getClinician, CLINICIANS } from "@/lib/clinicians";
import MonthNav from "@/components/billing/MonthNav";
import ClinicianSessions, { type SessionRow } from "@/components/billing/ClinicianSessions";
import StatGlossary from "@/components/billing/StatGlossary";
import NewGlow from "@/components/billing/NewGlow";
import InsuranceCollectedKpi, { type InsRow } from "@/components/billing/InsuranceCollectedKpi";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const w = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const initials = (name: string) => { const p = name.replace(/^(Dr\.?|Mrs\.?|Mr\.?|Ms\.?|Miss)\s+/i, "").trim().split(/\s+/); return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); };

export default async function ClinicianDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ y?: string; m?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/me");

  const { id } = await params;
  // Owner and biller can open any clinician (the biller reconciles their numbers);
  // a clinician only their own.
  if (!isOwner(user.role) && !isBiller(user.role) && id !== user.clinician.id) redirect(`/billing/clinician/${user.clinician.id}`);
  const clinician = getClinician(id);
  if (!clinician) redirect(isOwner(user.role) ? "/billing/overview" : "/billing/me");

  const sp = await searchParams;
  const nowYM = caymanYearMonth();
  const year = Number(sp.y) || nowYM.year;
  const month = Number(sp.m) || nowYM.month;

  const [all, insurers, settings, cfg, myClients, cptCodes] = await Promise.all([listSessions({ clinicianId: id }), listInsurers(), getClinicianSettings(id), getPracticeConfig(), listClients(id), listCptCodes()]);
  const c = computeClinicianMonth(all, settings, year, month, cfg.billerCommissionPct);
  // Referrals that need attention: expired, or expiring within 30 days.
  const todayISO = caymanToday();
  const referralAlerts = myClients
    .map((cl) => ({ cl, st: referralStatus(cl.profile.referral?.endDate, todayISO) }))
    .filter((x) => x.st.state === "expired" || x.st.state === "expiring")
    .sort((a, b) => (a.cl.profile.referral?.endDate ?? "").localeCompare(b.cl.profile.referral?.endDate ?? ""));
  const insurerName = (iid: string | null) =>
    insurers.find((i) => i.id === iid)?.name ?? (iid ? "Unknown insurer" : "Self-pay");
  const isSelf = id === user.clinician.id;
  // Rows for the "Insurance collected" breakdown: each payment that landed this
  // month, with the client + insurer resolved, tagged this-month vs earlier.
  const sessById = new Map(all.map((s) => [s.id, s] as const));
  const insRows: InsRow[] = c.insuranceCollectedItems.map((it) => {
    const s = sessById.get(it.sessionId);
    return { client: s ? `${s.clientFirst} ${s.clientLast}`.trim() : "", insurer: insurerName(it.insurerId), dateOfService: it.dateOfService, paidDate: it.paidDate, amount: it.amount, fromThisMonth: it.fromThisMonth };
  });
  const visits = [...c.visitSessions].sort((a, b) => b.dateOfService.localeCompare(a.dateOfService));
  const otherDeductions = c.otherDeductionPctAmount + c.healthDeduction + c.pension;
  // The clinician's own agreement with the biller — settled from their share,
  // so it is a genuine deduction here (the company's separate 3% is not).
  const biller = CLINICIANS.find((x) => x.billing === "biller");

  // Rows for the sessions table. `history` is every appointment this clinician
  // has logged, so clicking a client can show their whole run of visits — not
  // just the ones inside the month being viewed.
  const toRow = (s: (typeof all)[number]): SessionRow => ({
    id: s.id,
    date: s.dateOfService,
    clientId: s.clientId,
    client: `${s.clientFirst} ${s.clientLast}`.trim(),
    codes: codeSummary(s.cptCodes),
    codeList: s.cptCodes,
    fee: s.totalCost,
    copay: s.copayCollected,
    insurance: insurancePortion(s),
    status: !s.insurerId ? "self" : s.insuranceDisposition ? s.insuranceDisposition : s.insurancePaid ? "paid" : "pend",
    insurerId: s.insurerId,
    copayDue: s.copayDue,
    billed: !!s.billedDate,
  });

  // What's still with the insurers. This is the clinician's future pay — payout
  // follows cash, so this is the "when do I get the rest" question answered.
  const today = caymanToday();
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
        <div className="cd-kpi hastip" data-tip="How many sessions you logged this month."><div className="k">Appointments logged</div><div className="v">{c.appointments}</div></div>
        <div className="cd-kpi hastip" data-tip="The value of this month's work before deductions, whether or not the money has arrived."><div className="k">Total earned</div><div className="v">{money0(c.revenueGenerated)}</div></div>
        {/* Money taken at the appointment itself: the co-pay on an insured
            visit, or the whole fee when the client is self-pay. Sits with the
            insurance figures, since together they are the cash that arrived. */}
        <div className="cd-kpi hastip" data-tip="Cash taken on the day: co-pays on insured visits, or the whole fee when the client is self-pay. Money in hand."><div className="k">Collected at visit</div><div className="v">{money0(c.copayThisMonth)}</div></div>
        <NewGlow id="insbreakdown"><InsuranceCollectedKpi total={c.insuranceBilledThisMonth} thisMonth={c.insuranceThisMonthVisits} prior={c.insurancePriorVisits} monthLabel={MONTHS[month - 1]} rows={insRows} reportHref={`/billing/clinician/${id}/collections?y=${year}&m=${month}`} /></NewGlow>
        <div className="cd-kpi hastip" data-tip="Insurance not collected yet: claims still to bill, or billed and awaiting payment. Money still on its way to you."><div className="k">Insurance outstanding</div><div className="v owe">{money0(c.outstanding)}</div></div>
        {/* Co-pays that were due at this month's visits but not collected — money
            missed. Highlighted so it can't be ignored. */}
        <NewGlow id="copaynav"><Link href="/billing/copays" className="cd-kpi cd-kpilink"><div className="k hastip" data-tip="Co-pays due at your visits that weren't taken but are still owed. Click to record them as they come in.">Co-pays not collected</div><div className={`v ${c.uncollectedCopay > 0 ? "owe" : ""}`}>{money0(c.uncollectedCopay)}</div><div className="cd-kpicta">Record →</div></Link></NewGlow>
        <div className="cd-kpi hastip" data-tip="Co-pays deliberately waived this month: written off."><div className="k">Co-pays waived</div><div className="v">{money0(c.waivedCopay)}</div></div>
        {c.contractualWriteoff > 0 && <div className="cd-kpi hastip" data-tip="A claim amount settled with a contractual write-off this month."><div className="k">Contractual write-offs</div><div className="v">{money0(c.contractualWriteoff)}</div></div>}
        {c.writeDown > 0 && <div className="cd-kpi hastip" data-tip="A claim amount written down this month."><div className="k">Write-downs</div><div className="v">{money0(c.writeDown)}</div></div>}
      </div>
      {isSelf && <StatGlossary />}
      {c.uncollectedCopay > 0 && (
        <div className="cd-missnote">You didn&apos;t collect <b>{money(c.uncollectedCopay)}</b> in co-pays that were due this month. That&apos;s money owed to you at the visit — worth chasing.</div>
      )}
      {referralAlerts.length > 0 && (
        <div className="cd-refalert">
          <div className="cd-refalert-h">⚠ Referrals to renew — you can&apos;t bill past the end date</div>
          <div className="cd-refalert-list">
            {referralAlerts.map(({ cl, st }) => (
              <Link key={cl.id} href={`/billing/clients/${cl.id}`} className="cd-refalert-item">
                <span className="nm">{cl.first} {cl.last}</span>
                <span className={`tag ${st.state}`}>{st.state === "expired" ? `expired ${cl.profile.referral?.endDate}` : `ends ${cl.profile.referral?.endDate} · ${st.daysLeft}d`}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="cd-two">
        <div className="cd-card">
          <span className="cd-lab">{c.noPayout ? "Collections" : "Payout"} · {MONTHS[month - 1]}</span>
          {c.noPayout ? (
            <>
              <div className="cd-flowbar"><i style={{ width: "100%", background: "var(--indigo)" }} /></div>
              <div className="cd-flowline"><span className="lbl"><span className="cd-keydot" style={{ background: "#EEE7DB" }} />Collected this month</span><span className="amt">{money(c.collected)}</span></div>
              <div className="cd-flowline sub"><span className="lbl">↳ Co-pays collected at visits</span><span className="amt">{money(c.copayThisMonth)}</span></div>
              <div className="cd-flowline sub"><span className="lbl">↳ Insurance payments received</span><span className="amt">{money(c.insuranceBilledThisMonth)}</span></div>
              <div className="cd-rtotal"><span className="k"><span className="cd-keydot" style={{ background: "var(--indigo)" }} />Stays with the practice</span><span className="v">{money(c.collected)}</span></div>
              <p className="cd-note">As the owner you draw no payout — no retention or deductions are taken, and your collections stay with the practice. Your production is shown here so you can see your numbers.</p>
            </>
          ) : (
            <>
              <div className="cd-flowbar">
                <i style={{ width: `${w(c.payout, c.collected)}%`, background: "var(--indigo)" }} />
                <i style={{ width: `${w(c.retentionAmount, c.collected)}%`, background: "#8b93b8" }} />
                <i style={{ width: `${w(c.billerFromClinician, c.collected)}%`, background: "#43A9AE" }} />
                <i style={{ width: `${w(otherDeductions, c.collected)}%`, background: "#D9A441" }} />
              </div>
              <div className="cd-flowline"><span className="lbl"><span className="cd-keydot" style={{ background: "#EEE7DB" }} />Collected this month</span><span className="amt">{money(c.collected)}</span></div>
              <div className="cd-flowline sub"><span className="lbl">↳ Co-pays collected at visits</span><span className="amt">{money(c.copayThisMonth)}</span></div>
              <div className="cd-flowline sub"><span className="lbl">↳ Insurance payments received</span><span className="amt">{money(c.insuranceBilledThisMonth)}</span></div>
              <div className="cd-flowline minus"><span className="lbl"><span className="cd-keydot" style={{ background: "#8b93b8" }} />Company retention ({c.retentionPct}%)</span><span className="amt">−{money(c.retentionAmount)}</span></div>
              {c.billerFromClinician > 0 && (
                <>
                  <div className="cd-flowline minus">
                    <span className="lbl"><span className="cd-keydot" style={{ background: "#43A9AE" }} />Billing{biller ? ` · ${biller.name}` : ""} ({c.billerPct}%)</span>
                    <span className="amt">−{money(c.billerFromClinician)}</span>
                  </div>
                  <div className="cd-flowline sub"><span className="lbl">↳ {money0(c.insuranceBilledThisMonth)} insurance − {c.retentionPct}% retention = {money0(c.insuranceBilledThisMonth * c.billerBasePct / 100)}, then × {c.billerPct}% = {money0(c.billerFromClinician)}</span><span className="amt" /></div>
                </>
              )}
              {c.otherDeductionPct > 0 && <div className="cd-flowline minus"><span className="lbl"><span className="cd-keydot" style={{ background: "#D9A441" }} />Other ({c.otherDeductionPct}%)</span><span className="amt">−{money(c.otherDeductionPctAmount)}</span></div>}
              {c.healthDeduction > 0 && <div className="cd-flowline minus"><span className="lbl"><span className="cd-keydot" style={{ background: "#D9A441" }} />Health insurance</span><span className="amt">−{money(c.healthDeduction)}</span></div>}
              {c.pension > 0 && <div className="cd-flowline minus"><span className="lbl"><span className="cd-keydot" style={{ background: "#D9A441" }} />Pension ({c.pensionPct}% of after-retention share)</span><span className="amt">−{money(c.pension)}</span></div>}
              <div className="cd-rtotal"><span className="k"><span className="cd-keydot" style={{ background: "var(--indigo)" }} />Net payout</span><span className="v">{money(c.payout)}</span></div>
              <p className="cd-note">
                Payout follows the cash actually collected this month. Appointments still awaiting insurance pay out the month their payment arrives.
                {c.billerFromClinician > 0 && <> Billing is your own {c.billerPct}% agreement with {biller ? biller.name : "the biller"}, charged on your after-retention share of the insurance — {c.billerBasePct}% of the {money0(c.insuranceBilledThisMonth)} collected for you, not the gross.</>}
              </p>
              <Link href={`/billing/clinician/${id}/statement?y=${year}&m=${month}`} className="cd-stmt">🧾 View payout statement →</Link>
            </>
          )}
        </div>

        <div className="cd-card">
          <span className="cd-lab">This month&apos;s work</span>
          <div className="cd-workhead"><span style={{ fontSize: 13, color: "var(--muted)" }}>Settled vs coming in</span><span style={{ fontSize: 13, fontWeight: 700 }}>{money0(c.billedFromThisMonth)} of {money0(c.revenueGenerated)}</span></div>
          <div className="cd-prog"><i style={{ width: `${w(c.billedFromThisMonth, c.revenueGenerated)}%` }} /></div>
          <div className="cd-flowline"><span className="lbl">Revenue generated</span><span className="amt">{money(c.revenueGenerated)}</span></div>
          <div className="cd-flowline"><span className="lbl hastip" data-tip="This month's work the insurer has resolved (paid or written off). A progress figure, not cash. Only the collected part pays out.">Settled by insurers</span><span className="amt">{money(c.billedFromThisMonth)}</span></div>
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
          <ClinicianSessions month={visits.map(toRow)} insurers={insurers.filter((i) => i.active).map((i) => ({ id: i.id, name: i.name }))} canManage={isOwner(user.role) || isSelf} today={todayISO} cptCodes={cptCodes.filter((c) => c.active).map((c) => ({ code: c.code, description: c.description, fee: c.fee ?? 0 }))} />
        )}
      </div>
    </>
  );
}
