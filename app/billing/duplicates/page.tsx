import { redirect } from "next/navigation";
import Link from "next/link";
import { getBillingUser, canConfigureBilling } from "@/lib/billingRole";
import DuplicatesClient from "@/components/billing/DuplicatesClient";

export const dynamic = "force-dynamic";

// Admin cleanup: find client records that are the same person and merge them.
export default async function DuplicatesPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/duplicates");
  if (!canConfigureBilling(user.role)) redirect("/billing/me");

  return (
    <>
      <div className="su-topbar">
        <h1 className="su-h1">Merge duplicate clients</h1>
        <p className="su-sub">
          Records that look like the <b>same person</b> — the same name with a shared email or the same date of birth.
          Pick the record to keep; its sessions, documents, appointments and notes are preserved, the duplicates are
          folded into it and then removed. This can&apos;t be undone, so check each one.
        </p>
        <p className="su-sub" style={{ marginTop: 4 }}><Link href="/billing/clients">← Back to clients</Link></p>
      </div>
      <DuplicatesClient />
    </>
  );
}
