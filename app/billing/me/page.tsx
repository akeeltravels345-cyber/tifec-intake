import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";

export const dynamic = "force-dynamic";

// "My clients" — send the signed-in person to their own clinician detail page.
export default async function MyClients() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/me");
  redirect(`/billing/clinician/${user.clinician.id}`);
}
