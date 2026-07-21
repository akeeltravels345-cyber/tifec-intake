import { redirect } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { getClinician } from "@/lib/clinicians";
import { listNotices } from "@/lib/comms";
import NoticeBoard from "@/components/team/NoticeBoard";

export const dynamic = "force-dynamic";

export default async function NoticesPage() {
  const me = await getCurrentClinician();
  if (!me) redirect("/login?next=/team/notices");

  const notices = await listNotices();
  const canPost = me.contact === "owner" || me.contact === "admin";

  return (
    <NoticeBoard
      canPost={canPost}
      notices={notices.map((n) => ({
        id: n.id, title: n.title, body: n.body, eventAt: n.eventAt, pinned: n.pinned,
        createdAt: n.createdAt, author: getClinician(n.authorId)?.name ?? n.authorId,
      }))}
    />
  );
}
