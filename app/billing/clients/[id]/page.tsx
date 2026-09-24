import Link from "next/link";
import { randomUUID } from "crypto";
import { caymanToday } from "@/lib/caymanTime";
import { redirect, notFound } from "next/navigation";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { logAccess } from "@/lib/db";
import { listInsurers, listCptCodes, listSessions, codeSummary } from "@/lib/billing";
import { getClient, clinicianSeesClient, markClientSeen } from "@/lib/clients";
import { getClinician } from "@/lib/clinicians";
import { listExternalClinicians } from "@/lib/billing";
import { findIntakeForClient } from "@/lib/intakeLink";
import { selfPayOutstanding, benefitUsed } from "@/lib/billingCalc";
import { listNotesForClient, NOTES_ENABLED } from "@/lib/sessionNotes";
import ClientDetail, { type Activity } from "@/components/billing/ClientDetail";
import SessionNotes from "@/components/billing/SessionNotes";

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

  // HIPAA audit: record that this user opened this client's record. The page is
  // force-dynamic (not prefetched), so this fires on a real open, not on hover.
  // Only the opaque client id is stored (no name), keeping the log PHI-free.
  await logAccess({ id: randomUUID(), clinician_id: user.clinician.id, submission_token: `client:${id}`, action: "view", detail: `viewed client record (client:${id})`, at: new Date().toISOString() });
  // Clear the "New" tag for THIS user (per-person): the biller opening it doesn't
  // clear it for the clinician, and vice versa. Best-effort.
  await markClientSeen(id, user.clinician.id);

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
      codes: s.cptCodes, codeLabel: codeSummary(s.cptCodes, cptDesc),
      insurer: insName(s.insurerId), insurerId: s.insurerId, total: s.totalCost, copay: s.copayCollected, copayDue: s.copayDue,
      stage: !s.insurerId ? "self" : s.insuranceDisposition ? s.insuranceDisposition : s.insurancePaid ? "paid" : s.billedDate ? "billed" : "logged",
      paidDate: s.paidDate, billedDate: s.billedDate,
      selfPayStatus: s.selfPayStatus, selfPayOwed: selfPayOutstanding(s), insuranceCollected: s.insuranceCollected,
      billNote: s.billNote,
    }));

  // Clinical notes: anyone clinically LINKED to this client (their treating
  // clinician), never the oversight admin. Access follows the treating
  // relationship, not the billing role — so a biller who is also a practicum
  // clinician (e.g. Nick) sees notes for their own clients, and a pure biller,
  // who is never linked as a clinician, still sees none.
  const linked = await clinicianSeesClient(id, user.clinician.id);
  const canSeeNotes = NOTES_ENABLED && user.clinician.contact !== "admin" && linked;
  const noteRows = canSeeNotes
    ? (await listNotesForClient(id)).map((n) => ({ id: n.id, clinicianId: n.clinicianId, author: clinName(n.clinicianId), noteDate: n.noteDate, content: n.content, updatedAt: n.updatedAt }))
    : [];
  const todayStr = caymanToday();

  // Total insurance funds: the pot the biller set for a plan year, drawn down by
  // the insurance portion of every insured visit in that year. Computed here (we
  // have the sessions) and shown on the record so clinicians see what's left.
  const benefit = client.profile.benefit
    ? (() => {
        const { amount, year } = client.profile.benefit!;
        const used = benefitUsed(sessions, year);
        return { amount, year, used, remaining: Math.round((amount - used) * 100) / 100 };
      })()
    : null;

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
        insurers={insurers.filter((i) => i.active).map((i) => ({ id: i.id, name: i.name, billStyle: i.billStyle }))}
        clinicians={client.clinicianIds.map((cid) => ({ id: cid, name: clinName(cid) }))}
        activity={activity}
        benefit={benefit}
        canEdit
        canDelete={seesAll}
        today={caymanToday()}
        intakeForms={intakeForms}
        currentUserId={user.clinician.id}
        currentUserRole={user.clinician.contact === "admin" ? "admin" : user.role}
        cptCodes={cptCodes.filter((c) => c.active).map((c) => ({ code: c.code, description: c.description, fee: c.fee ?? 0 }))}
      />
      {canSeeNotes && (
        <div className="su-card" style={{ marginTop: 20, padding: "18px 20px" }}>
          <h2 className="su-sech" style={{ margin: "0 0 3px" }}>Session notes</h2>
          <p className="su-sub" style={{ margin: "0 0 14px" }}>Encrypted clinical notes — visible only to this client&apos;s clinicians.</p>
          <SessionNotes clientId={client.id} notes={noteRows} meId={user.clinician.id} today={todayStr} />
        </div>
      )}
    </>
  );
}
