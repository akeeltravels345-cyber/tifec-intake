import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingUser, isBiller } from "@/lib/billingRole";
import { listInsurers, listExternalClinicians } from "@/lib/billing";
import { CLINICIANS } from "@/lib/clinicians";
import ImportClient from "@/components/billing/ImportClient";

export const dynamic = "force-dynamic";

// Bring past work in from whatever the biller used before, including claims
// that were never billed. His page: the owner just wants the snapshot.
export default async function ImportPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/import");
  if (!isBiller(user.role)) redirect("/billing/me");

  const [insurers, external] = await Promise.all([listInsurers(), listExternalClinicians()]);
  const clinicians = [
    ...CLINICIANS.filter((c) => !c.intakeHidden).map((c) => ({ id: c.id, name: c.name })),
    ...external.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name })),
  ];

  return (
    <>
      <Link href="/billing/biller" className="ls-back">← Back to my dashboard</Link>
      <div className="su-topbar">
        <h1 className="su-h1">Import past work</h1>
        <p className="su-sub">
          Bring in the claims you&apos;re already tracking elsewhere, billed or not. Nothing is saved until you&apos;ve seen the preview and pressed import, and a claim that&apos;s already here won&apos;t be added twice.
        </p>
      </div>
      <ImportClient clinicians={clinicians} insurers={insurers.map((i) => ({ id: i.id, name: i.name }))} />
    </>
  );
}
