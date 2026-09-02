import { redirect } from "next/navigation";
import { getBillingUser, devMode, hasBillingBeta } from "@/lib/billingRole";
import { getSidebarData } from "@/lib/sidebarData";
import UnifiedSidebar from "@/components/UnifiedSidebar";
import IdleLogoutForUser from "@/components/IdleLogoutForUser";

export const dynamic = "force-dynamic";

export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing");
  // BETA: billing is only available to enrolled accounts. Everyone else goes back to intake.
  if (!hasBillingBeta(user.clinician)) redirect("/dashboard?billing=beta");

  const data = await getSidebarData(user.clinician);

  return (
    <div className="biz">
      {!devMode() && <IdleLogoutForUser />}
      <UnifiedSidebar data={data} isDev={devMode()} />
      <main className="bo-main">{children}</main>
    </div>
  );
}
