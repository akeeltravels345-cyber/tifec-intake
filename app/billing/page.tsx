import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";

export const dynamic = "force-dynamic";

// Send each role to their home screen.
export default async function BillingHome() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing");
  if (user.role === "owner") redirect("/billing/overview");
  if (user.role === "biller") redirect("/billing/payments");
  redirect("/billing/me");
}
