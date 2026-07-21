import { redirect } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { CONTACTS, CONTACT_LABEL, getClinician, canUseTickets } from "@/lib/clinicians";
import { listTickets, TICKET_AREAS } from "@/lib/comms";
import TicketList from "@/components/team/TicketList";

export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  const me = await getCurrentClinician();
  if (!me) redirect("/login?next=/team/tickets");
  if (!canUseTickets(me.id)) redirect("/team/messages");

  const all = await listTickets();
  // You see what you raised and what's assigned to you. The admin and owner
  // see everything, since they run the place.
  const seesAll = me.contact === "admin" || me.contact === "owner";
  const mine = seesAll ? all : all.filter((t) => t.createdBy === me.id || t.assignees.includes(me.id));

  return (
    <TicketList
      seesAll={seesAll}
      areas={[...TICKET_AREAS]}
      contacts={CONTACTS.map((c) => ({ id: c.id, name: c.name, label: CONTACT_LABEL[c.contact!] }))}
      tickets={mine.map((t) => ({
        id: t.id, ref: t.ref, subject: t.subject, area: t.area, status: t.status,
        createdAt: t.createdAt, updatedAt: t.updatedAt,
        raisedBy: getClinician(t.createdBy)?.name ?? t.createdBy,
        assignees: t.assignees.map((id) => getClinician(id)?.name ?? id),
        mine: t.createdBy === me.id,
      }))}
    />
  );
}
