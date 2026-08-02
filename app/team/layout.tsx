import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { unreadCount, unreadNotifications } from "@/lib/comms";
import TeamTabs from "@/components/team/TeamTabs";
import NotificationBell from "@/components/team/NotificationBell";

export const dynamic = "force-dynamic";

// The team area is for everyone who works here, so it lives in the intake app
// rather than behind the billing beta gate.
export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentClinician();
  if (!me) redirect("/login?next=/team/notices");
  const [unread, noteCount] = await Promise.all([unreadCount(me.id), unreadNotifications(me.id)]);

  return (
    <div className="tm">
      <div className="tm-strip" />
      <div className="tm-wrap">
        <div className="tm-top">
          <Link href="/today" className="tm-back">← Today</Link>
          <div className="tm-topright">
            <NotificationBell initialUnread={noteCount} />
            <span className="tm-me">{me.name}</span>
          </div>
        </div>
        <TeamTabs unread={unread} />
        <main className="tm-main">{children}</main>
      </div>
    </div>
  );
}
