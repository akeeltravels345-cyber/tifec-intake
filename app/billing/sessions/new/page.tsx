import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { listInsurers, listCptCodes } from "@/lib/billing";
import SessionForm from "@/components/billing/SessionForm";

export const dynamic = "force-dynamic";

export default async function NewSessionPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/sessions/new");

  const [insurers, cptCodes] = await Promise.all([listInsurers(), listCptCodes()]);
  const activeInsurers = insurers.filter((i) => i.active).map((i) => ({ id: i.id, name: i.name, copayType: i.copayType, copayRate: i.copayRate }));
  const activeCpt = cptCodes.filter((c) => c.active).map((c) => ({ code: c.code, description: c.description }));

  return (
    <div className="container-form" style={{ padding: 0 }}>
      <div className="ov-headrow">
        <div>
          <h2 className="ov-title">Log a session</h2>
          <p className="ov-sub">Logged as {user.clinician.name}. One row per visit.</p>
        </div>
        <Link href="/billing/me" className="bz-link">← Back</Link>
      </div>
      <SessionForm insurers={activeInsurers} cptCodes={activeCpt} />
    </div>
  );
}
