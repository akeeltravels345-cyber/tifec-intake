import { redirect } from "next/navigation";
import { getBillingUser, devMode } from "@/lib/billingRole";
import { CLINICIANS } from "@/lib/clinicians";
import BillingNav from "@/components/billing/BillingNav";
import DevBar from "@/components/billing/DevBar";
import IdleLogout from "@/components/IdleLogout";

export const dynamic = "force-dynamic";

export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing");
  const dev = devMode();
  const ownerId = CLINICIANS.find((c) => c.admin)?.id ?? CLINICIANS[0]?.id ?? "";
  return (
    <div>
      {!dev && <IdleLogout />}
      {dev && <DevBar role={user.role} meId={user.clinician.id} clinicians={CLINICIANS.map((c) => ({ id: c.id, name: c.name }))} ownerId={ownerId} />}
      <BillingNav role={user.role} />
      <div className="container">{children}</div>
    </div>
  );
}
