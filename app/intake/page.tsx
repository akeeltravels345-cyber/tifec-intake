import Link from "next/link";
import IntakeForm, { type ClinicianLite } from "@/components/IntakeForm";
import { CLINICIANS } from "@/lib/clinicians";
import { buildSections, clientLabel } from "@/lib/forms";

export const dynamic = "force-dynamic";

export default async function IntakePage({
  searchParams,
}: {
  searchParams: Promise<{ clinician?: string; form?: string; couple?: string; preview?: string }>;
}) {
  const params = await searchParams;
  // `intakeHidden` keeps an account out of the browsable clinician list, but a
  // direct link to it (e.g. the admin previewing their own form) must still work.
  const clinicians: ClinicianLite[] = CLINICIANS.filter(
    (c) => !c.intakeHidden || c.id === params.clinician
  ).map((c) => ({
    id: c.id,
    name: c.name,
    credentials: c.credentials,
    forms: c.forms.map((key) => ({
      key,
      label: clientLabel(key), // the client-facing form name
      sections: buildSections(key, c.extraSections),
    })),
  }));

  return (
    <div className="container container-form">
      {params.preview && (
        <div className="preview-bar no-print">
          <span>👁 Preview — this is how the form looks to clients.</span>
          <Link href="/dashboard">← Back to dashboard</Link>
        </div>
      )}
      <IntakeForm
        clinicians={clinicians}
        initialClinicianId={params.clinician}
        initialFormKey={params.couple ? "couples" : params.form}
        coupleId={params.couple}
      />
    </div>
  );
}
