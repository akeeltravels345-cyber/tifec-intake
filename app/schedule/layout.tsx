import { redirect } from "next/navigation";
import { getBillingUser, devMode } from "@/lib/billingRole";
import { isSystemAdmin, inScheduleBeta, type Clinician } from "@/lib/clinicians";
import { getSidebarData } from "@/lib/sidebarData";
import UnifiedSidebar from "@/components/UnifiedSidebar";
import IdleLogoutForUser from "@/components/IdleLogoutForUser";

export const dynamic = "force-dynamic";

// "My schedule" — each clinician's own agenda. Owner + Donnet + Nick (biller /
// practicum, who oversees the whole practice) see everyone; admin does too.
export const seesAllSchedule = (c: Clinician) => isSystemAdmin(c) || c.contact === "owner" || c.id === "donnet-oconnor" || c.id === "nick-oconnor";
export const isTreatingClinician = (c: Clinician) => !!c.test || (!c.intakeHidden && c.contact !== "biller" && c.contact !== "admin");

export default async function ScheduleLayout({ children }: { children: React.ReactNode }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/schedule");
  // Beta: only Shion + Nick (and admin / test) can reach the scheduling area yet.
  if (!inScheduleBeta(user.clinician)) redirect("/today");

  const data = await getSidebarData(user.clinician);
  return (
    <div className="biz">
      {!devMode() && <IdleLogoutForUser />}
      <UnifiedSidebar data={data} isDev={devMode()} />
      <main className="bo-main">{children}</main>
    </div>
  );
}
