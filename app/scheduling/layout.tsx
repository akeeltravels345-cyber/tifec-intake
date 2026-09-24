import { redirect } from "next/navigation";
import { getBillingUser, devMode } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import { getSidebarData } from "@/lib/sidebarData";
import UnifiedSidebar from "@/components/UnifiedSidebar";
import IdleLogoutForUser from "@/components/IdleLogoutForUser";

export const dynamic = "force-dynamic";

// The scheduler is its own area. It's open to the system admin (the builder) and
// the practice owner; everyone else is redirected away while it's still a prototype.
export default async function SchedulingLayout({ children }: { children: React.ReactNode }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/scheduling/calendar");
  if (!isSystemAdmin(user.clinician) && user.clinician.contact !== "owner") redirect("/today");

  const data = await getSidebarData(user.clinician);
  return (
    <div className="biz">
      {!devMode() && <IdleLogoutForUser />}
      <UnifiedSidebar data={data} isDev={devMode()} />
      <main className="bo-main">{children}</main>
    </div>
  );
}
