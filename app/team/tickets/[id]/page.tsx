import { redirect, notFound } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { CONTACTS, CONTACT_LABEL, getClinician } from "@/lib/clinicians";
import { getTicket, listMessages, ticketThreadId, markThreadRead } from "@/lib/comms";
import TicketDetail from "@/components/team/TicketDetail";

export const dynamic = "force-dynamic";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentClinician();
  const { id } = await params;
  if (!me) redirect(`/login?next=/team/tickets/${id}`);

  const t = await getTicket(id);
  if (!t) notFound();

  // Yours if you raised it or it's assigned to you; the owner and admin oversee all.
  const seesAll = me.contact === "admin" || me.contact === "owner";
  if (!seesAll && t.createdBy !== me.id && !t.assignees.includes(me.id)) redirect("/team/tickets");

  const threadId = ticketThreadId(t.id);
  const replies = await listMessages(threadId);
  await markThreadRead(threadId, me.id);

  return (
    <TicketDetail
      threadId={threadId}
      canManage={t.assignees.includes(me.id) || seesAll}
      contacts={CONTACTS.map((c) => ({ id: c.id, name: c.name, label: CONTACT_LABEL[c.contact!] }))}
      ticket={{
        id: t.id, ref: t.ref, subject: t.subject, area: t.area, body: t.body, status: t.status,
        createdAt: t.createdAt,
        raisedBy: getClinician(t.createdBy)?.name ?? t.createdBy,
        assignees: t.assignees.map((id) => ({ id, name: getClinician(id)?.name ?? id })),
      }}
      replies={replies.map((m) => ({
        id: m.id, body: m.body, at: m.createdAt,
        who: getClinician(m.senderId)?.name ?? m.senderId, mine: m.senderId === me.id,
      }))}
    />
  );
}
