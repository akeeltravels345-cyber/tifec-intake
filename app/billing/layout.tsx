import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import BillingNav from "@/components/billing/BillingNav";
import IdleLogout from "@/components/IdleLogout";

export const dynamic = "force-dynamic";

export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing");
  return (
    <div>
      <IdleLogout />
      <BillingNav role={user.role} />
      <div className="container">{children}</div>
    </div>
  );
}
