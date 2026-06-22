import { redirect } from "next/navigation";
import { getBillingUser, canConfigure } from "@/lib/billingRole";

export const dynamic = "force-dynamic";

export default async function DisbursementDashboard() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/dashboard");
  if (!canConfigure(user.role)) redirect("/billing/sessions");

  return (
    <div>
      <h2 className="section-title">Disbursements</h2>
      <p className="section-desc">Per-clinician monthly payout, with rollover. Coming next.</p>
      <div className="card bz-empty">Admin disbursement dashboard — under construction.</div>
    </div>
  );
}
