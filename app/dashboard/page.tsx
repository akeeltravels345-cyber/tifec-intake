import { redirect } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { getSubmissionsByClinician, type SubmissionRow, type SubmissionStatus } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { templateLabel } from "@/lib/forms";
import ShareLink from "@/components/ShareLink";
import CoupleLink from "@/components/CoupleLink";
import ScreeningShare from "@/components/ScreeningShare";
import DashboardShell, { type DashItem } from "@/components/DashboardShell";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  new: "New",
  reviewed: "Reviewed",
  archived: "Archived",
};

// Icon, short description, and accent tint for each form type's card.
const FORM_META: Record<string, { icon: string; desc: string; bg: string }> = {
  individual: { icon: "📝", desc: "Standard intake for an individual client.", bg: "#d9edec" },
  couples: { icon: "💞", desc: "Each partner fills out their own form, linked together.", bg: "#e4e6f3" },
  "dsm5-level1-adult": { icon: "📊", desc: "Brief 23-item symptom screening measure.", bg: "#f6edd6" },
};

// Short, scannable label per form type for the submissions list.
const SHORT_FORM: Record<string, string> = {
  individual: "Individual Intake",
  couples: "Couples Intake",
  "dsm5-level1-adult": "DSM-5 Level 1",
};

/** Initials from the clinician's name, ignoring honorifics. */
function initials(name: string): string {
  const words = name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter((w) => w && !/^(dr|mrs|mr|ms|miss)\.?$/i.test(w));
  const letters = words.slice(0, 2).map((w) => w[0]).join("");
  return (letters || name[0] || "?").toUpperCase();
}

/** Initials from a client name (first letters of up to two words). */
function clientInitials(name: string): string {
  const words = name.replace(/\(.*?\)/g, "").split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w[0]).join("");
  return (letters || name[0] || "?").toUpperCase();
}

/** Pull display name, email, and concern out of an encrypted row (clinician is authed + owns it). */
function display(row: SubmissionRow): { name: string; email: string } {
  try {
    const a = JSON.parse(decrypt(row.answers_encrypted)) as Record<string, string>;
    const couple = [a.his_name, a.hers_name].filter(Boolean).join(" & ");
    const name = a.full_name || couple || a.consent_signature_name || "Unnamed client";
    const email = a.email || a.his_email || a.hers_email || "";
    return { name, email };
  } catch {
    return { name: "Unreadable (key mismatch)", email: "" };
  }
}

export default async function Dashboard() {
  const me = await getCurrentClinician();
  if (!me) redirect("/login?next=/dashboard");

  const all = await getSubmissionsByClinician(me.id);

  // Decrypt once, then flag clients whose name or email appears on more than one form.
  const decoded = all.map((r) => ({ r, d: display(r) }));
  const nameCount: Record<string, number> = {};
  const emailCount: Record<string, number> = {};
  for (const { d } of decoded) {
    const nm = d.name.trim().toLowerCase();
    const em = (d.email || "").trim().toLowerCase();
    if (nm) nameCount[nm] = (nameCount[nm] || 0) + 1;
    if (em) emailCount[em] = (emailCount[em] || 0) + 1;
  }

  const items: DashItem[] = decoded.map(({ r, d }) => {
    const nm = d.name.trim().toLowerCase();
    const em = (d.email || "").trim().toLowerCase();
    return {
      token: r.token,
      name: d.name,
      email: d.email,
      initials: clientInitials(d.name),
      formLabel: SHORT_FORM[r.form_key] ?? (r.form_key || "Intake"),
      createdAt: r.created_at,
      status: r.status,
      statusLabel: STATUS_LABEL[r.status],
      hasNotes: !!r.notes_encrypted,
      isCouple: !!r.couple_id,
      isLinked: (!!nm && nameCount[nm] > 1) || (!!em && emailCount[em] > 1),
    };
  });

  const needReview = items.filter((i) => i.status === "new").length;
  // For the guided tour: open a real record (prefer one with DSM scoring to demo).
  const tourToken = (items.find((i) => /dsm/i.test(i.formLabel)) ?? items[0])?.token;

  // Forms view (rendered inside the shell when the Forms tab is active).
  const formsSlot = (
    <>
      <div className="form-cards" style={{ maxWidth: 900 }}>
        {me.forms.map((key) => {
          const meta = FORM_META[key];
          return (
            <div key={key} className="form-card">
              <div className="form-card-head">
                <div className="form-card-icon" style={{ background: meta?.bg }}>{meta?.icon ?? "📄"}</div>
                <div className="form-card-body">
                  <div className="form-card-name">{templateLabel(key)}</div>
                  {meta?.desc && <div className="form-card-desc">{meta.desc}</div>}
                </div>
              </div>
              {key === "couples" ? (
                <CoupleLink clinicianId={me.id} />
              ) : (
                <ShareLink path={`/intake?clinician=${me.id}&form=${key}`} />
              )}
            </div>
          );
        })}

        {me.admin && (
          <div className="form-card">
            <div className="form-card-head">
              <div className="form-card-icon" style={{ background: "#d9edec" }}>🧭</div>
              <div className="form-card-body">
                <div className="form-card-name">Wellbeing self-check (shareable)</div>
                <div className="form-card-desc">
                  A public self-screening for talks, workshops, or groups. People see their own results on their own
                  device - nothing is sent to you or stored.
                </div>
              </div>
            </div>
            <ScreeningShare />
          </div>
        )}
      </div>
    </>
  );

  return (
    <DashboardShell
      name={me.name}
      initials={initials(me.name)}
      isAdmin={!!me.admin}
      needReview={needReview}
      items={items}
      formsSlot={formsSlot}
      tourToken={tourToken}
    />
  );
}
