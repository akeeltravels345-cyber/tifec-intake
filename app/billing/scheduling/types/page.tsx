import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import { listAppointmentTypes } from "@/lib/scheduling";
import { listCptCodes } from "@/lib/billing";
import { FORM_TEMPLATES } from "@/lib/forms";
import SchedulingTabs from "@/components/billing/SchedulingTabs";
import AppointmentTypesManager from "@/components/billing/AppointmentTypesManager";

export const dynamic = "force-dynamic";

// The intake forms an appointment type can attach. Sorted so the main client
// intakes surface first; the label is the clinician-facing name.
const FORM_OPTIONS = Object.values(FORM_TEMPLATES)
  .map((f) => ({ key: f.key as string, label: f.label as string }))
  .sort((a, b) => a.label.localeCompare(b.label));

export default async function AppointmentTypesPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/scheduling/types");
  // Admin only while this is a prototype. No one else, not even the owner.
  if (!isSystemAdmin(user.clinician)) redirect("/today");

  const [types, cpt] = await Promise.all([listAppointmentTypes(), listCptCodes()]);
  const cptCodes = cpt.filter((c) => c.active !== false).map((c) => ({ code: c.code, description: c.description }));

  return (
    <div>
      <SchedulingTabs />
      <AppointmentTypesManager initial={types} cptCodes={cptCodes} formOptions={FORM_OPTIONS} />
    </div>
  );
}
