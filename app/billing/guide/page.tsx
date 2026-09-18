import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { HANDBOOK_CSS, handbookHtmlFor } from "@/components/billing/handbookData";

export const dynamic = "force-dynamic";

// The in-app reference handbook, rendered inline so it's one click away while
// someone works. It's role-aware: the biller, owner, clinician and admin each
// get the guide for the screens they actually see, picked from the signed-in
// person (a system admin "viewing as" a role gets that role's guide). The app
// forbids iframes (X-Frame-Options: DENY), so the handbook's markup and its CSS
// (scoped under #bhb) are injected directly into the page.
export default async function BillingGuidePage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/guide");

  const isAdmin = user.clinician.contact === "admin";
  const html = handbookHtmlFor(user.role, isAdmin);

  return (
    <div id="bhb">
      <style dangerouslySetInnerHTML={{ __html: HANDBOOK_CSS }} />
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
