import { redirect } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { devMode } from "@/lib/billingRole";
import { getSidebarData } from "@/lib/sidebarData";
import UnifiedSidebar from "@/components/UnifiedSidebar";

export const dynamic = "force-dynamic";

// The team area is for everyone who works here. It now shares the one app shell
// (sidebar handles Notice board / Messages / Tickets navigation) instead of its
// own tab bar.
export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentClinician();
  if (!me) redirect("/login?next=/team/notices");
  const data = await getSidebarData(me);

  return (
    <div className="biz">
      <UnifiedSidebar data={data} isDev={devMode()} />
      <main className="bo-main">
        <div className="tm-wrap">
          {children}
        </div>
      </main>
    </div>
  );
}
