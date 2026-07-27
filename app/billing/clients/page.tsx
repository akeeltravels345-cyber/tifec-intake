import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { listInsurers } from "@/lib/billing";
import { listClients, listAllClients, type Client } from "@/lib/clients";
import { getClinician } from "@/lib/clinicians";
import { listExternalClinicians } from "@/lib/billing";

export const dynamic = "force-dynamic";

const age = (dob?: string) => {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00Z`);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) a--;
  return a;
};

export default async function ClientsPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/clients");

  const seesAll = isBiller(user.role) || isOwner(user.role);
  const [clients, insurers, external] = await Promise.all([
    seesAll ? listAllClients() : listClients(user.clinician.id),
    listInsurers(),
    listExternalClinicians(),
  ]);
  const insName = (id: string | null) => insurers.find((i) => i.id === id)?.name ?? (id ? "Unknown" : "Self-pay");
  const clinName = (id: string) => getClinician(id)?.name ?? external.find((c) => c.id === id)?.name ?? id;

  const sorted = [...clients].sort((a, b) => `${a.last} ${a.first}`.localeCompare(`${b.last} ${b.first}`));

  return (
    <>
      <div className="su-topbar">
        <h1 className="su-h1">{seesAll ? "Clients" : "My clients"}</h1>
        <p className="su-sub">
          {seesAll
            ? "Every client in the practice. Open one to see their details and everything logged with them, and to build a CMS-1500 claim."
            : "The clients you've seen. Open one to see their details and their whole history with you."}
        </p>
      </div>

      <div className="su-sec">
        <div className="su-card">
          {sorted.length === 0 ? (
            <div className="bq-empty" style={{ padding: 28 }}><div className="big">No clients yet</div><div className="small">They&apos;ll appear here once sessions are logged or a roster is imported.</div></div>
          ) : (
            <div className="su-tblwrap">
              <table className="su-tbl" style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Date of birth</th>
                    <th>Usual insurer</th>
                    {seesAll && <th>Seen by</th>}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c: Client) => {
                    const a = age(c.profile.dob);
                    return (
                      <tr key={c.id}>
                        <td className="nm">{c.last}, {c.first}</td>
                        <td>{c.profile.dob ? <>{c.profile.dob}{a != null && <span className="su-hint"> · {a}y</span>}</> : <span className="su-hint">—</span>}</td>
                        <td>{insName(c.insurerId)}</td>
                        {seesAll && <td className="su-hint">{c.clinicianIds.map(clinName).join(", ") || "—"}</td>}
                        <td style={{ textAlign: "right" }}><Link className="su-link" href={`/billing/clients/${c.id}`}>Open →</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
