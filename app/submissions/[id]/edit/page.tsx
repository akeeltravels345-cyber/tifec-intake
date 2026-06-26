import Link from "next/link";
import { redirect } from "next/navigation";
import { getSubmissionByToken } from "@/lib/db";
import { getClinician } from "@/lib/clinicians";
import { getCurrentClinician } from "@/lib/auth";
import { buildSections, templateLabel, type FormTemplateKey } from "@/lib/forms";
import { decrypt } from "@/lib/crypto";
import LogoutButton from "@/components/LogoutButton";
import IdleLogout from "@/components/IdleLogout";
import EditSubmission from "@/components/EditSubmission";

export const dynamic = "force-dynamic";

export default async function EditSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: token } = await params;

  const me = await getCurrentClinician();
  if (!me) redirect(`/login?next=/submissions/${token}/edit`);

  const row = await getSubmissionByToken(token);
  // Editable only by the owning clinician (admins have no access to client data).
  if (!row || row.clinician_id !== me.id) {
    return (
      <div className="container">
        <div className="card">
          <h2 className="section-title">Submission not available</h2>
          <p className="muted">This submission doesn&apos;t exist, or it isn&apos;t assigned to your account.</p>
          <Link href="/dashboard">← Back to dashboard</Link>
        </div>
      </div>
    );
  }

  const clinician = getClinician(row.clinician_id);
  let answers: Record<string, string> = {};
  let decryptError = false;
  try {
    answers = JSON.parse(decrypt(row.answers_encrypted));
  } catch {
    decryptError = true;
  }

  const formKey = (row.form_key || clinician?.forms[0] || "individual") as FormTemplateKey;
  const sections = clinician ? buildSections(formKey, clinician.extraSections) : [];

  return (
    <div className="container">
      <IdleLogout />
      <div className="detail-topbar no-print">
        <Link href={`/submissions/${token}`} className="back-link" style={{ margin: 0 }}>← Back to record</Link>
        <LogoutButton />
      </div>

      <div className="card">
        <span className="type-chip">{templateLabel(formKey)}</span>
        <h1 className="who" style={{ fontSize: 22 }}>Edit responses · {answers.full_name || "Client"}</h1>
        <p className="section-desc" style={{ margin: "2px 0 0" }}>
          Correct any information the client entered incorrectly, then save.
        </p>
      </div>

      {decryptError ? (
        <div className="card">
          <div className="error">Could not decrypt this submission, so it can&apos;t be edited.</div>
        </div>
      ) : (
        <EditSubmission token={token} sections={sections} initialAnswers={answers} />
      )}
    </div>
  );
}
