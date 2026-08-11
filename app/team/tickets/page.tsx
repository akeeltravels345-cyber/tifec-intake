import { redirect } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { CLINICIANS, CONTACT_LABEL, getClinician, isContact } from "@/lib/clinicians";
import { listTickets, lastTicketCommenters, ticketWaitingOn, TICKET_AREAS } from "@/lib/comms";
import TicketList from "@/components/team/TicketList";

export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  const me = await getCurrentClinician();
  if (!me) redirect("/login?next=/team/tickets");

  const [all, lastBy] = await Promise.all([listTickets(), lastTicketCommenters()]);
  // You see what you raised and what's assigned to you. The admin and owner
  // see everything, since they run the place.
  const seesAll = me.contact === "admin" || me.contact === "owner";
  const mine = seesAll ? all : all.filter((t) => t.createdBy === me.id || t.assignees.includes(me.id));
  const nm = (id: string) => getClinician(id)?.name ?? id;

  return (
    <TicketList
      seesAll={seesAll}
      areas={[...TICKET_AREAS]}
      contacts={CLINICIANS.filter((c) => !c.intakeHidden || isContact(c.id)).map((c) => ({ id: c.id, name: c.name, label: c.contact ? CONTACT_LABEL[c.contact] : c.credentials.split("·")[0].trim() }))}
      tickets={mine.map((t) => {
        const waiting = ticketWaitingOn(t, lastBy[t.id] ?? null);
        return {
          id: t.id, ref: t.ref, subject: t.subject, area: t.area, status: t.status,
          createdAt: t.createdAt, updatedAt: t.updatedAt,
          raisedBy: nm(t.createdBy),
          assignees: t.assignees.map(nm),
          mine: t.createdBy === me.id,
          needsYou: waiting.includes(me.id),
          // Who currently has the ball, for the "Waiting on …" label.
          waitingOn: waiting.map(nm),
        };
      })}
    />
  );
}
