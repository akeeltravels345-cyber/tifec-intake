import { redirect } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { CLINICIANS, CONTACTS, CONTACT_LABEL, getClinician, isContact, isSystemAdmin } from "@/lib/clinicians";
import { listThreadsFor, listMessages, dmThreadId, dmPartner, markThreadRead, GROUP_THREAD_ID, groupSummaryFor, listGroupsForMember, getPresence } from "@/lib/comms";
import { listDocMetaByPrefix } from "@/lib/clientDocs";
import Messages from "@/components/team/Messages";

export const dynamic = "force-dynamic";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const me = await getCurrentClinician();
  if (!me) redirect("/login?next=/team/messages");
  const sp = await searchParams;

  // Everyone can message everyone. Contacts stay listed even when hidden from
  // the client-facing picker — the admin account is intakeHidden but must still
  // be reachable here.
  const people = CLINICIANS.filter((c) => !c.intakeHidden || isContact(c.id))
    .filter((c) => c.id !== me.id)
    .map((c) => ({
      id: c.id, name: c.name,
      role: c.contact ? CONTACT_LABEL[c.contact] : c.credentials.split("·")[0].trim(),
    }));

  const threads = await listThreadsFor(me.id);
  const group = await groupSummaryFor(me.id);
  const myGroups = await listGroupsForMember(me.id);
  const presence = await getPresence();
  // "all" opens the team-wide channel; "group:<id>" a custom group I'm in;
  // otherwise a normal DM.
  const isTeam = sp.to === "all";
  const openGroup = sp.to && sp.to.startsWith("group:") && sp.to !== "group:all" ? myGroups.find((g) => g.threadId === sp.to) : undefined;
  const withWhom = !isTeam && !openGroup && sp.to && getClinician(sp.to) && sp.to !== me.id ? sp.to : "";
  const activeThread = isTeam ? GROUP_THREAD_ID : openGroup ? openGroup.threadId : withWhom ? dmThreadId(me.id, withWhom) : "";
  const activeWith = isTeam ? "all" : openGroup ? openGroup.threadId : withWhom;
  const messages = activeThread ? await listMessages(activeThread) : [];
  if (activeThread) await markThreadRead(activeThread, me.id);

  // Attachments on the open thread's messages (images / voice notes / files).
  const kindOf = (mime: string): "image" | "audio" | "file" => (mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : "file");
  const attByMsg = new Map<string, { docId: string; kind: "image" | "audio" | "file"; name: string | null }[]>();
  if (activeThread) {
    const prefix = `${activeThread}:msg:`;
    for (const d of await listDocMetaByPrefix(prefix)) {
      const mid = d.ownerId.slice(prefix.length);
      if (!mid) continue;
      const list = attByMsg.get(mid) ?? [];
      list.push({ docId: d.docId, kind: kindOf(d.mime), name: d.name });
      attByMsg.set(mid, list);
    }
  }

  return (
    <Messages
      meId={me.id}
      people={people}
      presence={presence}
      everyone={{ unread: group.unread, lastBody: group.lastBody, lastAt: group.lastAt }}
      groups={myGroups.map((g) => ({ threadId: g.threadId, name: g.name, lastBody: g.lastBody, lastAt: g.lastAt, unread: g.unread, memberCount: g.memberIds.length }))}
      activeGroup={openGroup ? {
        threadId: openGroup.threadId,
        name: openGroup.name,
        canModerate: openGroup.createdBy === me.id || me.contact === "owner" || isSystemAdmin(me),
        members: openGroup.memberIds.map((id) => ({ id, name: id === me.id ? "You" : getClinician(id)?.name ?? id, isMe: id === me.id, isCreator: id === openGroup.createdBy })),
      } : null}
      activeWith={activeWith}
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
        attachments: attByMsg.get(m.id) ?? [],
      }))}
      threadId={activeThread}
    />
  );
}
