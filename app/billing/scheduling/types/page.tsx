import { redirect } from "next/navigation";
import { getBillingUser, isOwner } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import { listAppointmentTypes } from "@/lib/scheduling";
import { listCptCodes } from "@/lib/billing";
import { FORM_TEMPLATES } from "@/lib/forms";
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
  if (!isOwner(user.role) && !isSystemAdmin(user.clinician)) redirect("/billing/me");

  const [types, cpt] = await Promise.all([listAppointmentTypes(), listCptCodes()]);
  const cptCodes = cpt.filter((c) => c.active !== false).map((c) => ({ code: c.code, description: c.description }));

  return <AppointmentTypesManager initial={types} cptCodes={cptCodes} formOptions={FORM_OPTIONS} />;
}
