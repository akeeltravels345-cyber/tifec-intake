import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { listInsurers, listCptCodes, listSessions } from "@/lib/billing";
import SessionForm from "@/components/billing/SessionForm";

export const dynamic = "force-dynamic";

export default async function NewSessionPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/sessions/new");

  const [insurers, cptCodes, mySessions] = await Promise.all([
    listInsurers(),
    listCptCodes(),
    listSessions({ clinicianId: user.clinician.id }),
  ]);
  const activeInsurers = insurers.filter((i) => i.active).map((i) => ({ id: i.id, name: i.name, copayType: i.copayType, copayRate: i.copayRate }));
  const activeCpt = cptCodes.filter((c) => c.active).map((c) => ({ code: c.code, description: c.description, fee: c.fee ?? 0, hrs: c.hrs ?? 1 }));

  // Distinct clients this clinician has seen before, most recent first, with the
  // insurer they last used — so a returning client is one click, not a re-type.
  const seen = new Map<string, { first: string; last: string; insurerId: string | null; lastVisit: string; visits: number }>();
  for (const s of [...mySessions].sort((a, b) => b.dateOfService.localeCompare(a.dateOfService))) {
    const first = s.clientFirst?.trim() ?? "", last = s.clientLast?.trim() ?? "";
    if (!first && !last) continue;
    const key = `${first}|${last}`.toLowerCase();
    const prev = seen.get(key);
    if (prev) prev.visits += 1;
    // Sorted newest-first, so the first sighting carries their latest insurer.
    else seen.set(key, { first, last, insurerId: s.insurerId, lastVisit: s.dateOfService, visits: 1 });
  }
  const clients = [...seen.values()];

  return (
    <>
      <Link href="/billing/me" className="ls-back">← Back to my payout</Link>
      <div className="ls-topbar">
        <h1 className="ls-h1">Log a session</h1>
        <p className="ls-sub">Logged as {user.clinician.name}. Pick the service code(s) and the money fills in.</p>
      </div>
      <SessionForm insurers={activeInsurers} cptCodes={activeCpt} clients={clients} />
    </>
  );
}
