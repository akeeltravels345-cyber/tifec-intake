import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { listSessions, listInsurers } from "@/lib/billing";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toFixed(2)}`;

export default async function SessionsPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/sessions");

  const [sessions, insurers] = await Promise.all([
    listSessions({ clinicianId: user.clinician.id }),
    listInsurers(),
  ]);
  const insurerName = (id: string | null) => insurers.find((i) => i.id === id)?.name ?? (id ? "—" : "Self-pay");

  return (
    <div>
      <div className="bz-head">
        <div>
          <h2 className="section-title">My sessions</h2>
          <p className="section-desc">Log each visit as you see clients. Amounts in KYD.</p>
        </div>
        <Link href="/billing/sessions/new" className="primary" style={{ textDecoration: "none" }}>+ Log a session</Link>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {sessions.length === 0 ? (
          <div className="bz-empty">
            No sessions logged yet.<br />
            <Link href="/billing/sessions/new">Log your first session →</Link>
          </div>
        ) : (
          <table className="bz-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Insurer</th>
                <th>CPT</th>
                <th className="num">Cost</th>
                <th className="num">Co-pay</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{s.dateOfService}</td>
                  <td>{s.clientFirst} {s.clientLast}</td>
                  <td>{insurerName(s.insurerId)}</td>
                  <td>{s.cptCodes.length ? s.cptCodes.map((c) => <span key={c} className="bz-chip">{c}</span>) : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                  <td className="num">{money(s.totalCost)}</td>
                  <td className="num">{money(s.copayCollected)}</td>
                  <td>
                    {s.insurancePaid ? (
                      <span className="badge bz-pill-paid">Paid {s.paidDate ? `· ${s.paidDate}` : ""}</span>
                    ) : (
                      <span className="badge bz-pill-pending">Pending</span>
                    )}
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
