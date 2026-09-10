import { redirect } from "next/navigation";
import { getBillingUser, devMode } from "@/lib/billingRole";
import { isSystemAdmin, type Clinician } from "@/lib/clinicians";
import { getSidebarData } from "@/lib/sidebarData";
import UnifiedSidebar from "@/components/UnifiedSidebar";
import IdleLogoutForUser from "@/components/IdleLogoutForUser";

export const dynamic = "force-dynamic";

// "My schedule" — each clinician's own agenda. Owner + Donnet see everyone.
// Open to treating clinicians (and those two); the biller and unsigned are out.
export const seesAllSchedule = (c: Clinician) => isSystemAdmin(c) || c.contact === "owner" || c.id === "donnet-oconnor";
export const isTreatingClinician = (c: Clinician) => !!c.test || (!c.intakeHidden && c.contact !== "biller" && c.contact !== "admin");

export default async function ScheduleLayout({ children }: { children: React.ReactNode }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/schedule");
  if (!seesAllSchedule(user.clinician) && !isTreatingClinician(user.clinician)) redirect("/today");

  const data = await getSidebarData(user.clinician);
  return (
    <div className="biz">
      {!devMode() && <IdleLogoutForUser />}
      <UnifiedSidebar data={data} isDev={devMode()} />
      <main className="bo-main">{children}</main>
    </div>
  );
}
