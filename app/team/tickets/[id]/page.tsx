import { redirect, notFound } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { CLINICIANS, CONTACT_LABEL, getClinician, isContact } from "@/lib/clinicians";
import { getTicket, listMessages, ticketThreadId, markThreadRead, ticketWaitingOn } from "@/lib/comms";
import { listDocMetaByPrefix } from "@/lib/clientDocs";
import TicketDetail from "@/components/team/TicketDetail";

export const dynamic = "force-dynamic";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentClinician();
  const { id } = await params;
  if (!me) redirect(`/login?next=/team/tickets/${id}`);

  const t = await getTicket(id);
  if (!t) notFound();

  // Yours if you raised it, logged it for someone, or it's assigned to you; the
  // owner and admin oversee all.
  const seesAll = me.contact === "admin" || me.contact === "owner";
  if (!seesAll && t.createdBy !== me.id && t.enteredBy !== me.id && !t.assignees.includes(me.id)) redirect("/team/tickets");

  const threadId = ticketThreadId(t.id);
  const replies = await listMessages(threadId);
  await markThreadRead(threadId, me.id);

  // One pass over every attachment on this ticket and its comments. Owner id is
  // "ticket:<id>" for the first post, "ticket:<id>:msg:<mid>" for a comment.
  const docs = await listDocMetaByPrefix(`ticket:${t.id}`);
  const firstPost = docs.filter((d) => d.ownerId === `ticket:${t.id}`);
  const images = firstPost.filter((d) => d.mime.startsWith("image/")).map((d) => d.docId);
  const attByMsg = new Map<string, { docId: string; kind: "image" | "audio" }[]>();
  for (const d of docs) {
    const m = d.ownerId.match(/:msg:(.+)$/);
    if (!m) continue;
    const kind = d.mime.startsWith("audio/") ? "audio" : "image";
    const list = attByMsg.get(m[1]) ?? [];
    list.push({ docId: d.docId, kind });
    attByMsg.set(m[1], list);
  }

  const nm = (id: string) => getClinician(id)?.name ?? id;
  const waiting = ticketWaitingOn(t, replies.length ? replies[replies.length - 1].senderId : null);

  return (
    <TicketDetail
      threadId={threadId}
      images={images}
      canManage={t.assignees.includes(me.id) || seesAll}
      waitingOn={waiting.map(nm)}
      yourTurn={waiting.includes(me.id)}
      contacts={CLINICIANS.filter((c) => !c.intakeHidden || isContact(c.id)).map((c) => ({ id: c.id, name: c.name, label: c.contact ? CONTACT_LABEL[c.contact] : c.credentials.split("·")[0].trim() }))}
      ticket={{
        id: t.id, ref: t.ref, subject: t.subject, area: t.area, body: t.body, status: t.status,
        createdAt: t.createdAt,
        raisedBy: nm(t.createdBy),
        enteredBy: t.enteredBy ? nm(t.enteredBy) : null,
        assignees: t.assignees.map((id) => ({ id, name: nm(id) })),
      }}
      replies={replies.map((m) => ({
        id: m.id, body: m.body, at: m.createdAt,
        who: nm(m.senderId), mine: m.senderId === me.id,
        attachments: attByMsg.get(m.id) ?? [],
      }))}
    />
  );
}
