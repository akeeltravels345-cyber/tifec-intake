import Link from "next/link";
import { redirect } from "next/navigation";
import { getSubmissionByToken, getCoupleSubmissions, logAccess } from "@/lib/db";
import { getClinician } from "@/lib/clinicians";
import { getCurrentClinician } from "@/lib/auth";
import { buildSections, labelMap, templateLabel, type FormTemplateKey } from "@/lib/forms";
import { decrypt, randomId } from "@/lib/crypto";
import { isDsmForm } from "@/lib/dsm";
import StatusControl from "@/components/StatusControl";
import LogoutButton from "@/components/LogoutButton";
import IdleLogout from "@/components/IdleLogout";
import SubmissionActions from "@/components/SubmissionActions";
import NotesEditor from "@/components/NotesEditor";
import DsmSummary from "@/components/DsmSummary";
import DsmAnswers from "@/components/DsmAnswers";

export const dynamic = "force-dynamic";

/** Quick-reference contact fields, handling both individual and couples forms. */
function snapshot(a: Record<string, string>): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const add = (label: string, value?: string) => {
    if (value) out.push({ label, value });
  };
  if (a.full_name || a.dob) {
    add("Name", a.full_name);
    add("Date of birth", a.dob);
    add("Age", a.age);
    add("Phone", a.cell_phone || a.home_phone);
    add("Email", a.email);
  } else {
    add("His name", a.his_name);
    add("Hers name", a.hers_name);
    add("His phone", a.his_cell_phone);
    add("Hers phone", a.hers_cell_phone);
    add("His email", a.his_email);
    add("Hers email", a.hers_email);
  }
  return out;
}

export default async function SubmissionView({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: token } = await params;

  const me = await getCurrentClinician();
  if (!me) redirect(`/login?next=/submissions/${token}`);

  const row = await getSubmissionByToken(token);
  // Submissions are visible only to the owning clinician. Admins have an
  // oversight role and are intentionally NOT granted access to client answers.
  if (!row || row.clinician_id !== me.id) {
    return (
      <div className="container">
        <div className="card">
          <h2 className="section-title">Submission not available</h2>
          <p className="muted">
            This submission doesn&apos;t exist, or it isn&apos;t assigned to your account.
          </p>
          <Link href="/dashboard">← Back to dashboard</Link>
        </div>
      </div>
    );
  }

  // HIPAA audit: record that this clinician viewed this submission.
  await logAccess({
    id: randomId(),
    clinician_id: me.id,
    submission_token: token,
    action: "view",
    detail: "viewed submission",
    at: new Date().toISOString(),
  });

  const clinician = getClinician(row.clinician_id);
  let answers: Record<string, string> = {};
  let notes = "";
  let decryptError = false;
  try {
    answers = JSON.parse(decrypt(row.answers_encrypted));
    if (row.notes_encrypted) notes = decrypt(row.notes_encrypted);
  } catch {
    decryptError = true;
  }

  const formKey = (row.form_key || clinician?.forms[0] || "individual") as FormTemplateKey;
  const sections = clinician ? buildSections(formKey, clinician.extraSections) : [];
  const labels = labelMap(sections);
  // Per-field example text (for showing questions in their entirety, e.g. DSM Q23).
  const fieldExamples: Record<string, string> = {};
  for (const s of sections) for (const f of s.fields) if (f.examples) fieldExamples[f.name] = f.examples;
  const when = new Date(row.created_at).toLocaleString("en-US");
  const snap = decryptError ? [] : snapshot(answers);

  // Linked couple partner(s): the other partner's submission(s) in the same couple.
  const partners: { token: string; name: string }[] = [];
  if (row.couple_id) {
    const couple = await getCoupleSubmissions(row.clinician_id, row.couple_id);
    for (const c of couple) {
      if (c.token === row.token) continue;
      let pname = "Partner";
      try {
        pname = (JSON.parse(decrypt(c.answers_encrypted)) as Record<string, string>).full_name || "Partner";
      } catch {
        /* leave default */
      }
      partners.push({ token: c.token, name: pname });
    }
  }

  return (
    <div className="container">
      <IdleLogout />
      <div className="detail-topbar no-print">
        <Link href="/dashboard" className="back-link" style={{ margin: 0 }}>← Dashboard</Link>
        <LogoutButton />
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <span className="type-chip">{templateLabel(formKey)}</span>
            <h1 className="who" style={{ fontSize: 22 }}>
              {answers.full_name || "Client intake"}
            </h1>
            <p className="section-desc" style={{ margin: "2px 0 0" }}>
              {clinician?.name ?? "Client"} · Submitted {when}
            </p>
          </div>
          <SubmissionActions token={row.token} />
        </div>

        {snap.length > 0 && (
          <div className="snapshot">
            {snap.map((s) => (
              <div key={s.label} className="snap-item">
                <div className="snap-label">{s.label}</div>
                <div className="snap-value">{s.value}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <StatusControl token={row.token} initial={row.status} />
        </div>
      </div>

      {row.couple_id && (
        <div className="card couple-card">
          <h2 className="section-title" style={{ marginBottom: 4 }}>👥 Couple</h2>
          {partners.length > 0 ? (
            <p className="section-desc" style={{ margin: 0 }}>
              Linked partner{partners.length > 1 ? "s" : ""}:{" "}
              {partners.map((p, idx) => (
                <span key={p.token}>
                  {idx > 0 && ", "}
                  <Link href={`/submissions/${p.token}`}>{p.name}&apos;s form</Link>
                </span>
              ))}
            </p>
          ) : (
            <p className="section-desc" style={{ margin: 0 }}>
              The other partner hasn&apos;t submitted their form yet.
            </p>
          )}
        </div>
      )}

      {decryptError ? (
        <div className="card">
          <div className="error">
            Could not decrypt this submission. The ENCRYPTION_KEY may have changed since it was saved.
          </div>
        </div>
      ) : (
        <>
          {isDsmForm(formKey) && <DsmSummary answers={answers} />}

          <div className="card">
            <NotesEditor token={row.token} initial={notes} />
          </div>

          {sections.map((section) => {
            // The DSM symptom grid gets a dedicated colour-coded, domain-grouped view.
            if (isDsmForm(formKey) && section.id === "dsm-symptoms") {
              return <DsmAnswers key={section.id} answers={answers} labels={labels} examples={fieldExamples} />;
            }
            const rows = section.fields.filter((f) => answers[f.name] !== undefined && answers[f.name] !== "");
            if (rows.length === 0) return null;
            return (
              <div className="card" key={section.id}>
                <h2 className="section-title">{section.title}</h2>
                {rows.map((f) => (
                  <div className="answer-row" key={f.name}>
                    <div className="q">
                      {labels[f.name] || f.name}
                      {f.examples && <span className="q-sub">{f.examples}</span>}
                    </div>
                    <div className="a">{answers[f.name] === "true" ? "✓ Agreed" : answers[f.name]}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}

      <p className="muted no-print" style={{ fontSize: 12 }}>
        🔒 This page is generated from encrypted storage and visible only to your signed-in account. Access is logged.
      </p>
    </div>
  );
}
