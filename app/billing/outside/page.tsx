import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Outside clients (the biller's private book of non-practice clinicians) is
// TEMPORARILY DISABLED. The full implementation is preserved in git history; to
// re-enable, restore this file and the sidebar link. For now this route just
// sends the biller back to the billing queue.
export default async function OutsidePage() {
  redirect("/billing/payments");
}
