import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import { listSessions, getPracticeConfig } from "@/lib/billing";
import { collectedInMonth } from "@/lib/billingCalc";
import { caymanYearMonth } from "@/lib/caymanTime";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
};

// Admin-only history of the platform processing fee: what it has earned each
// month, from cash actually collected that month. Linked from the "Fee earned
// this month" card on Today.
export default async function FeeHistoryPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/fees");
  if (!isSystemAdmin(user.clinician)) redirect("/today");

  const [all, cfg] = await Promise.all([listSessions(), getPracticeConfig()]);
  const feePct = cfg.processingFeePct ?? 0;
  const now = caymanYearMonth();
  const nowKey = `${now.year}-${String(now.month).padStart(2, "0")}`;

  // Every month cash could have landed: the current month plus any month that
  // appears as a service, insurance-paid, or co-pay-paid date.
  const keys = new Set<string>([nowKey]);
  for (const s of all) {
    for (const d of [s.dateOfService, s.paidDate, s.copayPaidDate]) {
      const k = String(d || "").slice(0, 7);
      if (k.length === 7) keys.add(k);
    }
  }

  const rows = [...keys]
    .map((key) => {
      const [y, m] = key.split("-").map((x) => parseInt(x, 10));
      const collected = collectedInMonth(all, y, m);
      return { key, collected, fee: r2((collected * feePct) / 100) };
    })
    .filter((r) => r.collected > 0 || r.key === nowKey)
    .sort((a, b) => b.key.localeCompare(a.key));

  const totalCollected = r2(rows.reduce((t, r) => t + r.collected, 0));
  const totalFee = r2(rows.reduce((t, r) => t + r.fee, 0));

  return (
    <div className="fh-wrap">
      <Link href="/today" className="ls-back">← Back to Today</Link>
      <h1 className="fh-h1">Fee history</h1>
      <p className="fh-sub">
        Your platform processing fee is <b>{feePct}%</b> of cash collected. Here is what it has earned, month by month, from the money that actually came in each month.
      </p>

      {feePct === 0 && (
        <p className="fh-note">Set your processing fee % in <Link href="/billing/config">Setup</Link> to see these fill in.</p>
      )}

      <div className="fh-totals">
        <div className="fh-tot"><div className="k">Fee earned, all time</div><div className="v">{money(totalFee)}</div></div>
        <div className="fh-tot"><div className="k">Cash collected, all time</div><div className="v">{money(totalCollected)}</div></div>
      </div>

      <div className="fh-tablewrap">
        <table className="fh-table">
          <thead>
            <tr><th>Month</th><th className="num">Cash collected</th><th className="num">Fee earned ({feePct}%)</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={r.key === nowKey ? "now" : ""}>
                <td>{monthLabel(r.key)}{r.key === nowKey && <span className="fh-chip">this month</span>}</td>
                <td className="num">{money(r.collected)}</td>
                <td className="num strong">{money(r.fee)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td>All time</td><td className="num">{money(totalCollected)}</td><td className="num strong">{money(totalFee)}</td></tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
