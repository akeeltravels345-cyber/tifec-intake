import { redirect } from "next/navigation";
import { caymanToday, caymanYearMonth } from "@/lib/caymanTime";
import { getBillingUser, canSeeBusiness } from "@/lib/billingRole";
import { listSessions, listInsurers, getClinicianSettings, getPracticeConfig, runningExpensesTotalForMonth, expensesForMonth } from "@/lib/billing";
import { computeClinicianMonth, computeBusinessMonth, computeBottomLine, insurancePortion, ageDays } from "@/lib/billingCalc";
import { CLINICIANS } from "@/lib/clinicians";
import OverviewClient, { type OverviewData, type ClinRow } from "@/components/billing/OverviewClient";

export const dynamic = "force-dynamic";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const r2 = (n: number) => Math.round(n * 100) / 100;

export default async function OwnerOverview({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/overview");
  if (!canSeeBusiness(user.role)) redirect("/billing/me");

  const sp = await searchParams;
  const nowYM = caymanYearMonth();
  const year = Number(sp.y) || nowYM.year;
  const month = Number(sp.m) || nowYM.month;
  const prevY = month === 1 ? year - 1 : year;
  const prevM = month === 1 ? 12 : month - 1;
  const today = caymanToday();

  const [allSessions, insurerList, cfg] = await Promise.all([listSessions(), listInsurers(), getPracticeConfig()]);
  const settingsList = await Promise.all(CLINICIANS.map((c) => getClinicianSettings(c.id)));
  const settingsMap = new Map(CLINICIANS.map((c, i) => [c.id, settingsList[i]]));
  const bizFor = (y: number, m: number) =>
    computeBusinessMonth(CLINICIANS.map((c) => computeClinicianMonth(allSessions.filter((s) => s.clinicianId === c.id), settingsMap.get(c.id)!, y, m, c.intakeHidden ? 0 : cfg.billerCommissionPct)), y, m);

  const biz = bizFor(year, month);
  const prev = bizFor(prevY, prevM);
  const expensesTotal = runningExpensesTotalForMonth(cfg, year, month);
  const monthExpenses = expensesForMonth(cfg, year, month).expenses;
  const bottom = computeBottomLine(biz, expensesTotal, cfg.processingFeePct ?? 0);
  // The builder's processing-fee line shows only to the admin (the builder).
  const isAdmin = user.clinician.contact === "admin";

  const earned = biz.revenueGenerated;
  const thisMonthOutstanding = r2(biz.perClinician.reduce((t, c) => t + c.outstandingThisMonth, 0));
  const earnedCollected = r2(earned - thisMonthOutstanding);
  const mKey = `${year}-${String(month).padStart(2, "0")}`;
  const cashRollover = r2(allSessions.filter((s) => s.insurancePaid && s.paidDate?.slice(0, 7) === mKey && !s.dateOfService?.startsWith(mKey)).reduce((t, s) => t + insurancePortion(s), 0));

  // 6-month cash-collected trend
  const trend = Array.from({ length: 6 }, (_, k) => {
    let m = month - 5 + k, y = year;
    while (m <= 0) { m += 12; y -= 1; }
    return { label: SHORT[m - 1], value: bizFor(y, m).collected, current: m === month && y === year };
  });

  // outstanding by insurer, with aging
  const insName = (id: string | null) => insurerList.find((i) => i.id === id)?.name ?? "—";
  const map = new Map<string, { name: string; count: number; amount: number; oldestDays: number }>();
  for (const s of allSessions) {
    if (!s.insurerId || s.insurancePaid) continue;
    const amt = insurancePortion(s);
    if (amt <= 0) continue;
    const cur = map.get(s.insurerId) ?? { name: insName(s.insurerId), count: 0, amount: 0, oldestDays: 0 };
    cur.count += 1; cur.amount = r2(cur.amount + amt); cur.oldestDays = Math.max(cur.oldestDays, ageDays(s.dateOfService, today));
    map.set(s.insurerId, cur);
  }
  const insurers = [...map.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.amount - a.amount);
  const insurersTotal = r2(insurers.reduce((t, i) => t + i.amount, 0));

  const nameOf = (id: string) => CLINICIANS.find((c) => c.id === id)?.name ?? id;
  const clinicians: ClinRow[] = biz.perClinician
    .filter((c) => c.appointments > 0 || c.collected > 0 || c.outstanding > 0)
    .map((c) => ({
      id: c.clinicianId, name: nameOf(c.clinicianId), role: "",
      appts: c.appointments, collected: c.collected, owed: c.outstandingThisMonth, payout: c.payout,
      revenueGenerated: c.revenueGenerated, billed: c.billedFromThisMonth, outstandingThisMonth: c.outstandingThisMonth, copay: c.copayThisMonth, uncollectedCopay: c.uncollectedCopay, waivedCopay: c.waivedCopay,
    }));

  const data: OverviewData = {
    year, month, monthName: MONTHS[month - 1], prevMonthName: MONTHS[prevM - 1],
    earned, earnedCollected, earnedOwed: thisMonthOutstanding,
    earnedDelta: prev.revenueGenerated > 0 ? ((earned - prev.revenueGenerated) / prev.revenueGenerated) * 100 : null,
    cashTotal: biz.collected, cashCopays: biz.copays, cashInsurance: biz.billed, cashRollover,
    bottom, trend,
    expenses: monthExpenses.map((e) => ({ name: e.name, detail: e.detail, amount: e.amount, breakdown: e.breakdown })),
    expensesTotal,
    insurers, insurersTotal,
    clinicians, appointments: biz.appointments,
    uncollectedCopay: biz.uncollectedCopay,
    waivedCopay: biz.waivedCopay,
    contractualWriteoff: biz.contractualWriteoff,
    writeDown: biz.writeDown,
    isAdmin,
  };

  return <OverviewClient data={data} />;
}
