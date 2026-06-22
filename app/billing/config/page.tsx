import { redirect } from "next/navigation";
import { getBillingUser, canConfigure } from "@/lib/billingRole";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/config");
  if (!canConfigure(user.role)) redirect("/billing/sessions");

  return (
    <div>
      <h2 className="section-title">Setup</h2>
      <p className="section-desc">Insurers, CPT codes, and per-clinician retention. Coming next.</p>
      <div className="card bz-empty">Admin configuration panel — under construction.</div>
    </div>
  );
}
