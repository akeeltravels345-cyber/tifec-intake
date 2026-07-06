import { redirect } from "next/navigation";
import { getBillingUser, canConfigure } from "@/lib/billingRole";
import { listInsurers, listCptCodes, listClinicianSettings } from "@/lib/billing";
import { CLINICIANS } from "@/lib/clinicians";
import ConfigClient from "@/components/billing/ConfigClient";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/config");
  if (!canConfigure(user.role)) redirect("/billing/me");

  const [insurers, cptCodes, settings] = await Promise.all([listInsurers(), listCptCodes(), listClinicianSettings()]);
  const clinicians = CLINICIANS.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div>
      <div className="bz-head">
        <div>
          <h2 className="section-title">Setup</h2>
          <p className="section-desc">Insurers &amp; co-pay rules, service codes, and each clinician&apos;s split (40% company retention by default). Owner only.</p>
        </div>
      </div>
      <ConfigClient insurers={insurers} cptCodes={cptCodes} clinicians={clinicians} settings={settings} />
    </div>
  );
}
