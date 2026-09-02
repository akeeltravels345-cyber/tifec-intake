import { redirect } from "next/navigation";
import { getBillingUser, devMode } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import { getSidebarData } from "@/lib/sidebarData";
import UnifiedSidebar from "@/components/UnifiedSidebar";
import IdleLogoutForUser from "@/components/IdleLogoutForUser";

export const dynamic = "force-dynamic";

// The scheduler is its own area, admin-only while it's a prototype. This layout
// gives every /scheduling/* page the app shell (sidebar) and the admin gate, so
// the owner and everyone else can't reach it.
export default async function SchedulingLayout({ children }: { children: React.ReactNode }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/scheduling/calendar");
  if (!isSystemAdmin(user.clinician)) redirect("/today");

  const data = await getSidebarData(user.clinician);
  return (
    <div className="biz">
      {!devMode() && <IdleLogoutForUser />}
      <UnifiedSidebar data={data} isDev={devMode()} />
      <main className="bo-main">{children}</main>
    </div>
  );
}
