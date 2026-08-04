import { redirect } from "next/navigation";
import { getBillingUser, canMarkBilled } from "@/lib/billingRole";
import { listStaged } from "@/lib/importStaging";
import { listInsurers, listCptCodes } from "@/lib/billing";
import { getClinician } from "@/lib/clinicians";
import ImportReview, { type StagedRow } from "@/components/billing/ImportReview";

export const dynamic = "force-dynamic";

export default async function ImportReviewPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/import/review");
  const isAdmin = user.clinician.contact === "admin";
  if (!canMarkBilled(user.role) && !isAdmin) redirect("/billing/me");

  const [pending, accepted, rejected, insurers, cpts] = await Promise.all([
    listStaged("pending"), listStaged("accepted"), listStaged("rejected"),
    listInsurers(), listCptCodes(),
  ]);

  const rows: StagedRow[] = pending.map((r) => ({
    id: r.id, clientFirst: r.clientFirst, clientLast: r.clientLast, dob: r.dob,
    insurerName: r.insurerName, cpt: r.cpt, fee: r.fee, dateOfService: r.dateOfService,
    billedDate: r.billedDate, invNo: r.invNo,
    clinician: getClinician(r.clinicianId)?.name ?? r.clinicianId,
  }));

  return (
    <ImportReview
      rows={rows}
      counts={{ pending: pending.length, accepted: accepted.length, rejected: rejected.length }}
      insurers={insurers.filter((i) => i.active).map((i) => ({ id: i.id, name: i.name }))}
      cptCodes={cpts.filter((c) => c.active).map((c) => ({ code: c.code, description: c.description }))}
      canLoad={isAdmin || canMarkBilled(user.role)}
    />
  );
}
