import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import GuideFrame from "@/components/billing/GuideFrame";

export const dynamic = "force-dynamic";

// The biller's reference handbook, embedded in the app so it's one click away
// while they work. The content lives in /public/biller-handbook.html.
export default async function BillerGuidePage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/guide");

  return (
    <div style={{ maxWidth: 1220, margin: "0 auto" }}>
      <GuideFrame />
    </div>
  );
}
