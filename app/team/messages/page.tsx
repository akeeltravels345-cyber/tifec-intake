import { redirect } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { CLINICIANS, CONTACTS, CONTACT_LABEL, getClinician, isContact } from "@/lib/clinicians";
import { listThreadsFor, listMessages, dmThreadId, dmPartner, markThreadRead } from "@/lib/comms";
import Messages from "@/components/team/Messages";

export const dynamic = "force-dynamic";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const me = await getCurrentClinician();
  if (!me) redirect("/login?next=/team/messages");
  const sp = await searchParams;

  // Clinicians message the owner, biller or admin. Those three can reach anyone,
  // so they get the full roster. Contacts stay listed even when they're hidden
  // from the client-facing picker: the admin account is intakeHidden, and must
  // still be reachable here.
  const iAmContact = isContact(me.id);
  const people = (iAmContact ? CLINICIANS.filter((c) => !c.intakeHidden || isContact(c.id)) : CONTACTS)
    .filter((c) => c.id !== me.id)
    .map((c) => ({
      id: c.id, name: c.name,
      role: c.contact ? CONTACT_LABEL[c.contact] : c.credentials.split("·")[0].trim(),
    }));

  const threads = await listThreadsFor(me.id);
  const withWhom = sp.to && getClinician(sp.to) && sp.to !== me.id ? sp.to : "";
  const activeThread = withWhom ? dmThreadId(me.id, withWhom) : "";
  const messages = activeThread ? await listMessages(activeThread) : [];
  if (activeThread) await markThreadRead(activeThread, me.id);

  return (
    <Messages
      meId={me.id}
      people={people}
      activeWith={withWhom}
      threads={threads.map((t) => {
        const other = dmPartner(t.threadId, me.id) ?? "";
        return {
          id: other, name: getClinician(other)?.name ?? other,
          lastBody: t.lastBody, lastAt: t.lastAt, unread: t.unread,
          fromMe: t.lastSender === me.id,
        };
      }).filter((t) => t.name)}
      messages={messages.map((m) => ({
        id: m.id, body: m.body, at: m.createdAt,
        mine: m.senderId === me.id, who: getClinician(m.senderId)?.name ?? m.senderId,
      }))}
      threadId={activeThread}
    />
  );
}
