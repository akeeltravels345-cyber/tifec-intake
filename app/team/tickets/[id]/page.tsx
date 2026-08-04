import { redirect, notFound } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { CLINICIANS, CONTACT_LABEL, getClinician, isContact } from "@/lib/clinicians";
import { getTicket, listMessages, ticketThreadId, markThreadRead } from "@/lib/comms";
import { listDocMetaForClient } from "@/lib/clientDocs";
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
  const images = (await listDocMetaForClient(`ticket:${t.id}`))
    .filter((d) => d.mime.startsWith("image/"))
    .map((d) => d.docId);

  return (
    <TicketDetail
      threadId={threadId}
      images={images}
      canManage={t.assignees.includes(me.id) || seesAll}
      contacts={CLINICIANS.filter((c) => !c.intakeHidden || isContact(c.id)).map((c) => ({ id: c.id, name: c.name, label: c.contact ? CONTACT_LABEL[c.contact] : c.credentials.split("·")[0].trim() }))}
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
