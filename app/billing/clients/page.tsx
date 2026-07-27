import { redirect } from "next/navigation";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { listInsurers, listSessions, listExternalClinicians } from "@/lib/billing";
import { listClients, listAllClients } from "@/lib/clients";
import { getClinician } from "@/lib/clinicians";
import ClientsList, { type ClientRow } from "@/components/billing/ClientsList";

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
  const [clients, insurers, external, sessions] = await Promise.all([
    seesAll ? listAllClients() : listClients(user.clinician.id),
    listInsurers(),
    listExternalClinicians(),
    seesAll ? listSessions() : listSessions({ clinicianId: user.clinician.id }),
  ]);
  const insName = (id: string | null) => insurers.find((i) => i.id === id)?.name ?? (id ? "Unknown" : "Self-pay");
  const clinName = (id: string) => getClinician(id)?.name ?? external.find((c) => c.id === id)?.name ?? id;

  // How many insured (claimable) sessions each client has — drives whether they
  // can be picked for a batch claim run.
  const billableByClient = new Map<string, number>();
  for (const s of sessions) {
    if (!s.clientId || !s.insurerId) continue;
    billableByClient.set(s.clientId, (billableByClient.get(s.clientId) ?? 0) + 1);
  }

  const rows: ClientRow[] = [...clients]
    .sort((a, b) => `${a.last} ${a.first}`.localeCompare(`${b.last} ${b.first}`))
    .map((c) => ({
      id: c.id, first: c.first, last: c.last,
      dob: c.profile.dob ?? null, age: age(c.profile.dob),
      insurer: insName(c.insurerId),
      seenBy: seesAll ? c.clinicianIds.map(clinName).join(", ") : "",
      billable: billableByClient.get(c.id) ?? 0,
    }));

  return (
    <>
      <div className="su-topbar">
        <h1 className="su-h1">{seesAll ? "Clients" : "My clients"}</h1>
        <p className="su-sub">
          {seesAll
            ? "Every client in the practice. Open one for their details and history, or tick several and build their CMS-1500 claims in one run."
            : "The clients you've seen. Open one for their details and history, or tick several to build their CMS-1500 claims together."}
        </p>
      </div>
      <ClientsList rows={rows} seesAll={seesAll} />
    </>
  );
}
