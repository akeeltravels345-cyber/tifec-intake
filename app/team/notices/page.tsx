import { redirect } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { getClinician, isContact, isSystemAdmin } from "@/lib/clinicians";
import { listNotices } from "@/lib/comms";
import NoticeBoard from "@/components/team/NoticeBoard";

export const dynamic = "force-dynamic";

export default async function NoticesPage() {
  const me = await getCurrentClinician();
  if (!me) redirect("/login?next=/team/notices");

  const notices = await listNotices();
  // The owner, the biller and the admin can post to the whole practice.
  const canPost = isContact(me.id);

  return (
    <NoticeBoard
      canPost={canPost}
      meId={me.id}
      isAdmin={isSystemAdmin(me)}
      notices={notices.map((n) => ({
        id: n.id, title: n.title, body: n.body, eventAt: n.eventAt, pinned: n.pinned,
        createdAt: n.createdAt, authorId: n.authorId, author: getClinician(n.authorId)?.name ?? n.authorId,
        askAck: n.askAck,
        acks: n.acks.map((a) => ({ name: getClinician(a.userId)?.name ?? a.userId, response: a.response })),
        iAcked: n.acks.some((a) => a.userId === me.id),
      }))}
    />
  );
}
