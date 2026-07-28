import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { listInsurers, listCptCodes, listSessions } from "@/lib/billing";
import { getClient, clinicianSeesClient } from "@/lib/clients";
import { getClinician } from "@/lib/clinicians";
import { listExternalClinicians } from "@/lib/billing";
import { findIntakeForClient } from "@/lib/intakeLink";
import ClientDetail, { type Activity } from "@/components/billing/ClientDetail";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getBillingUser();
  if (!user) redirect(`/login?next=/billing/clients/${id}`);

  const client = await getClient(id);
  if (!client) notFound();

  const seesAll = isBiller(user.role) || isOwner(user.role);
  // Isolation: a clinician may only open a client linked to them.
  if (!seesAll && !(await clinicianSeesClient(id, user.clinician.id))) redirect("/billing/clients");

  const [insurers, cptCodes, sessions, external, intakeForms] = await Promise.all([
    listInsurers(),
    listCptCodes(),
    // The biller/owner see every visit for this client (across clinicians); a
    // clinician sees only their own visits with them.
    seesAll ? listSessions({ clientId: id }) : listSessions({ clientId: id, clinicianId: user.clinician.id }),
    listExternalClinicians(),
    // Connect the intake system: find this client's intake form(s) by name + DOB.
    findIntakeForClient(client.first, client.last, client.profile.dob),
  ]);
  const insName = (idv: string | null) => insurers.find((i) => i.id === idv)?.name ?? (idv ? "Unknown" : "Self-pay");
  const clinName = (cid: string) => getClinician(cid)?.name ?? external.find((c) => c.id === cid)?.name ?? cid;
  const cptDesc = (code: string) => cptCodes.find((c) => c.code === code)?.description ?? "";

  const activity: Activity[] = sessions
    .sort((a, b) => b.dateOfService.localeCompare(a.dateOfService))
    .map((s) => ({
      id: s.id, date: s.dateOfService, clinician: clinName(s.clinicianId),
      codes: s.cptCodes, codeLabel: s.cptCodes.map((c) => cptDesc(c)).filter(Boolean).join(", "),
      insurer: insName(s.insurerId), total: s.totalCost, copay: s.copayCollected,
      stage: !s.insurerId ? "self" : s.insurancePaid ? "paid" : s.billedDate ? "billed" : "logged",
      paidDate: s.paidDate, billedDate: s.billedDate,
    }));

  return (
    <>
      <Link href="/billing/clients" className="ls-back">← All clients</Link>
      <ClientDetail
        id={client.id}
        first={client.first}
        last={client.last}
        insurerId={client.insurerId}
        profile={client.profile}
        seenBy={seesAll ? client.clinicianIds.map(clinName) : []}
        insurers={insurers.filter((i) => i.active).map((i) => ({ id: i.id, name: i.name }))}
        clinicians={client.clinicianIds.map((cid) => ({ id: cid, name: clinName(cid) }))}
        activity={activity}
        canEdit
        canDelete={seesAll}
        today={new Date().toISOString().slice(0, 10)}
        intakeForms={intakeForms}
        currentUserId={user.clinician.id}
        currentUserRole={user.clinician.contact === "admin" ? "admin" : user.role}
      />
    </>
  );
}
