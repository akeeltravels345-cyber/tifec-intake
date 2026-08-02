import { redirect } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { devMode } from "@/lib/billingRole";
import { unreadNotifications } from "@/lib/comms";
import { getSidebarData } from "@/lib/sidebarData";
import UnifiedSidebar from "@/components/UnifiedSidebar";
import NotificationBell from "@/components/team/NotificationBell";

export const dynamic = "force-dynamic";

// The team area is for everyone who works here. It now shares the one app shell
// (sidebar handles Notice board / Messages / Tickets navigation) instead of its
// own tab bar.
export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentClinician();
  if (!me) redirect("/login?next=/team/notices");
  const [noteCount, data] = await Promise.all([unreadNotifications(me.id), getSidebarData(me)]);

  return (
    <div className="biz">
      <UnifiedSidebar data={data} isDev={devMode()} />
      <main className="bo-main">
        <div className="tm-wrap">
          <div className="tm-top">
            <div />
            <div className="tm-topright">
              <NotificationBell initialUnread={noteCount} />
              <span className="tm-me">{me.name}</span>
            </div>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
