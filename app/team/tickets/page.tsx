import { redirect } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { CLINICIANS, CONTACT_LABEL, getClinician, isContact } from "@/lib/clinicians";
import { listTickets, TICKET_AREAS } from "@/lib/comms";
import TicketList from "@/components/team/TicketList";

export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  const me = await getCurrentClinician();
  if (!me) redirect("/login?next=/team/tickets");

  const all = await listTickets();
  // You see what you raised and what's assigned to you. The admin and owner
  // see everything, since they run the place.
  const seesAll = me.contact === "admin" || me.contact === "owner";
  const mine = seesAll ? all : all.filter((t) => t.createdBy === me.id || t.assignees.includes(me.id));

  return (
    <TicketList
      seesAll={seesAll}
      areas={[...TICKET_AREAS]}
      contacts={CLINICIANS.filter((c) => !c.intakeHidden || isContact(c.id)).map((c) => ({ id: c.id, name: c.name, label: c.contact ? CONTACT_LABEL[c.contact] : c.credentials.split("·")[0].trim() }))}
      tickets={mine.map((t) => ({
        id: t.id, ref: t.ref, subject: t.subject, area: t.area, status: t.status,
        createdAt: t.createdAt, updatedAt: t.updatedAt,
        raisedBy: getClinician(t.createdBy)?.name ?? t.createdBy,
        assignees: t.assignees.map((id) => getClinician(id)?.name ?? id),
        mine: t.createdBy === me.id,
        needsYou: t.assignees.includes(me.id) && t.status !== "resolved",
      }))}
    />
  );
}
