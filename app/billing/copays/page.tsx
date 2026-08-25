import { redirect } from "next/navigation";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { listSessions, listExternalClinicians } from "@/lib/billing";
import { uncollectedCopay } from "@/lib/billingCalc";
import { getClinician } from "@/lib/clinicians";
import { caymanToday } from "@/lib/caymanTime";
import OutstandingCopays, { type CopayRow } from "@/components/billing/OutstandingCopays";

export const dynamic = "force-dynamic";

/** Every visit with a co-pay that was due but not collected, so it can be
 *  recorded when it comes in. Clinicians see only their own visits. The owner —
 *  who also carries his own clients — lands on his own and can toggle to see
 *  everyone; the biller / admin land on everyone. */
export default async function CopaysPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/copays");
  const isAdmin = user.clinician.contact === "admin";
  const canSeeAll = isBiller(user.role) || isOwner(user.role) || isAdmin;

  const sp = await searchParams;
  // The owner starts on his own clients; biller/admin start on everyone. Anyone
  // who canSeeAll may switch; a plain clinician is always scoped to themselves.
  const defaultScope = isOwner(user.role) && !isAdmin ? "mine" : canSeeAll ? "all" : "mine";
  const wanted = sp.scope === "all" || sp.scope === "mine" ? sp.scope : defaultScope;
  const scope: "all" | "mine" = wanted === "all" && canSeeAll ? "all" : "mine";

  const [sessions, external] = await Promise.all([
    scope === "all" ? listSessions() : listSessions({ clinicianId: user.clinician.id }),
    listExternalClinicians(),
  ]);
  const clinName = (id: string) => getClinician(id)?.name ?? external.find((c) => c.id === id)?.name ?? id;

  const rows: CopayRow[] = sessions
    .map((s) => ({ s, owed: uncollectedCopay(s) }))
    .filter(({ owed }) => owed > 0)
    .map(({ s, owed }) => ({
      id: s.id,
      date: s.dateOfService,
      clientId: s.clientId,
      client: `${s.clientFirst} ${s.clientLast}`.trim() || "Unnamed client",
      clinician: clinName(s.clinicianId),
      owed: Math.round((owed + Number.EPSILON) * 100) / 100,
    }))
    .sort((a, b) => a.date.localeCompare(b.date)); // oldest owed first

  return (
    <OutstandingCopays rows={rows} today={caymanToday()} showClinician={scope === "all"} canToggle={canSeeAll} scope={scope} />
  );
}
