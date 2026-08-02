import { redirect } from "next/navigation";
import Link from "next/link";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { listSessions } from "@/lib/billing";
import { selfPayOutstanding, uncollectedCopay } from "@/lib/billingCalc";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Everything clients still owe the practice, so the biller can chase or invoice:
 *  self-pay running balances + co-pays that were due but not collected. */
export default async function BalancesPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/balances");
  const isAdmin = user.clinician.contact === "admin";
  if (!isBiller(user.role) && !isOwner(user.role) && !isAdmin) redirect("/billing/me");

  const sessions = await listSessions();

  interface Row { clientId: string | null; name: string; selfPay: number; copay: number; total: number; oldest: string; count: number; hasSelfPay: boolean; }
  const byClient = new Map<string, Row>();
  for (const s of sessions) {
    const sp = selfPayOutstanding(s);
    const cp = uncollectedCopay(s);
    if (sp + cp <= 0) continue;
    const key = s.clientId ?? `${s.clientFirst}|${s.clientLast}`.toLowerCase();
    const name = `${s.clientFirst} ${s.clientLast}`.trim() || "Unnamed client";
    const r = byClient.get(key) ?? { clientId: s.clientId ?? null, name, selfPay: 0, copay: 0, total: 0, oldest: s.dateOfService, count: 0, hasSelfPay: false };
    r.selfPay += sp; r.copay += cp; r.total += sp + cp; r.count += 1;
    if (sp > 0) r.hasSelfPay = true;
    if (s.dateOfService < r.oldest) r.oldest = s.dateOfService;
    byClient.set(key, r);
  }
  const rows = [...byClient.values()]
    .map((r) => ({ ...r, selfPay: r2(r.selfPay), copay: r2(r.copay), total: r2(r.total) }))
    .sort((a, b) => a.oldest.localeCompare(b.oldest)); // oldest owed first — chase these first

  const totalSelfPay = r2(rows.reduce((t, r) => t + r.selfPay, 0));
  const totalCopay = r2(rows.reduce((t, r) => t + r.copay, 0));
  const totalOwed = r2(totalSelfPay + totalCopay);

  return (
    <>
      <div className="su-topbar">
        <h1 className="su-h1">Owed by clients</h1>
        <p className="su-sub">Self-pay balances and co-pays that were due but not collected — chase or invoice the oldest first. Amounts in KYD.</p>
      </div>

      <div className="bal-kpis">
        <div className="bal-kpi"><div className="k">Total owed</div><div className="v">{money(totalOwed)}</div></div>
        <div className="bal-kpi"><div className="k">Self-pay balances</div><div className="v">{money(totalSelfPay)}</div></div>
        <div className="bal-kpi"><div className="k">Co-pays not collected</div><div className="v">{money(totalCopay)}</div></div>
      </div>

      {rows.length === 0 ? (
        <div className="bq-empty" style={{ padding: 28 }}><div className="big">Nothing outstanding</div><div className="small">Every self-pay balance is settled and every co-pay was collected.</div></div>
      ) : (
        <table className="su-tbl bal-tbl">
          <thead>
            <tr><th>Client</th><th className="r">Self-pay owed</th><th className="r">Co-pay not collected</th><th className="r">Total owed</th><th>Oldest</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.clientId ?? r.name}>
                <td>{r.clientId ? <Link href={`/billing/clients/${r.clientId}`} className="bal-name">{r.name}</Link> : r.name}<div className="bal-sub">{r.count} visit{r.count === 1 ? "" : "s"}</div></td>
                <td className="r">{r.selfPay > 0 ? money(r.selfPay) : "—"}</td>
                <td className="r">{r.copay > 0 ? money(r.copay) : "—"}</td>
                <td className="r bal-tot">{money(r.total)}</td>
                <td>{r.oldest}</td>
                <td className="r">{r.clientId && r.hasSelfPay ? <Link href={`/billing/clients/${r.clientId}/invoice`} className="bal-invoice">Invoice →</Link> : r.clientId ? <Link href={`/billing/clients/${r.clientId}`} className="bal-invoice">Open →</Link> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
