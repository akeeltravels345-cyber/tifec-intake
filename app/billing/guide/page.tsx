import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { HANDBOOK_CSS, HANDBOOK_HTML } from "@/components/billing/handbookData";

export const dynamic = "force-dynamic";

// The biller's reference handbook, rendered inline so it's one click away while
// they work. The app forbids iframes (X-Frame-Options: DENY), so the handbook's
// markup and its CSS (scoped under #bhb) are injected directly into the page.
export default async function BillerGuidePage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/guide");

  return (
    <div id="bhb">
      <style dangerouslySetInnerHTML={{ __html: HANDBOOK_CSS }} />
      <div dangerouslySetInnerHTML={{ __html: HANDBOOK_HTML }} />
    </div>
  );
}
