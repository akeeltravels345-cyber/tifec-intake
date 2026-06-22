import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { canMarkPaid } from "@/lib/billingRole";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/payments");
  if (!canMarkPaid(user.role)) redirect("/billing/sessions");

  return (
    <div>
      <h2 className="section-title">Payments</h2>
      <p className="section-desc">Mark insurance payments as received. Coming next.</p>
      <div className="card bz-empty">Biller payment view — under construction.</div>
    </div>
  );
}
