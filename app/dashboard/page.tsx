import { redirect } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { getSubmissionsByClinician, type SubmissionRow, type SubmissionStatus } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { templateLabel } from "@/lib/forms";
import ShareLink from "@/components/ShareLink";
import CoupleLink from "@/components/CoupleLink";
import { type DashItem } from "@/components/DashboardSubmissions";
import DashboardShell from "@/components/DashboardShell";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  new: "New",
  reviewed: "Reviewed",
  archived: "Archived",
};

// Icon, short description, and accent tint for each form type's card.
const FORM_META: Record<string, { icon: string; desc: string; bg: string }> = {
  individual: { icon: "📝", desc: "Standard intake for an individual client.", bg: "#e7f1f0" },
  couples: { icon: "💞", desc: "Each partner fills out their own form, linked together.", bg: "#fbeef0" },
  "dsm5-level1-adult": { icon: "📊", desc: "Brief 23-item symptom screening measure.", bg: "#fcf3da" },
};

// Short, scannable label per form type for the submissions list.
const SHORT_FORM: Record<string, string> = {
  individual: "Individual Intake",
  couples: "Couples Intake",
  "dsm5-level1-adult": "DSM-5 Level 1",
};

/** Initials from a clinician name, ignoring honorifics. */
function initials(name: string): string {
  const words = name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter((w) => w && !/^(dr|mrs|mr|ms|miss)\.?$/i.test(w));
  const letters = words.slice(0, 2).map((w) => w[0]).join("");
  return (letters || name[0] || "?").toUpperCase();
}

/** Pull a display name + concern snippet out of an encrypted row (clinician is authed + owns it). */
function display(row: SubmissionRow): { name: string; concern: string } {
  try {
    const a = JSON.parse(decrypt(row.answers_encrypted)) as Record<string, string>;
    // Individual intake uses full_name; couples uses his_name / hers_name.
    const couple = [a.his_name, a.hers_name].filter(Boolean).join(" & ");
    const name = a.full_name || couple || a.consent_signature_name || "Unnamed client";
    const concern = (a.reasons_for_help || a.his_reasons || a.hers_reasons || "").slice(0, 80);
    return { name, concern };
  } catch {
    return { name: "Unreadable (key mismatch)", concern: "" };
  }
}

export default async function Dashboard() {
  const me = await getCurrentClinician();
  if (!me) redirect("/login?next=/dashboard");

  const all = await getSubmissionsByClinician(me.id);

  // Map each couple_id to the partner names that have submitted (for linkage labels).
  const coupleNames = new Map<string, string[]>();
  for (const r of all) {
    if (!r.couple_id) continue;
    const arr = coupleNames.get(r.couple_id) ?? [];
    arr.push(display(r).name);
    coupleNames.set(r.couple_id, arr);
  }

  // All submissions, decrypted to display data, for the live search + filter list.
  const items: DashItem[] = all.map((r) => {
    const d = display(r);
    let coupleLabel: string | undefined;
    if (r.couple_id) {
      const others = (coupleNames.get(r.couple_id) ?? []).filter((n) => n !== d.name);
      coupleLabel = others.length ? `Couple · with ${others.join(", ")}` : "Couple · awaiting partner";
    }
    return {
      token: r.token,
      name: d.name,
      concern: d.concern + (d.concern.length >= 80 ? "…" : ""),
      formLabel: SHORT_FORM[r.form_key] ?? (r.form_key || "Intake"),
      dateLabel: new Date(r.created_at).toLocaleString("en-US"),
      status: r.status,
      statusLabel: STATUS_LABEL[r.status],
      hasNotes: !!r.notes_encrypted,
      coupleLabel,
    };
  });

  const needReview = items.filter((i) => i.status === "new").length;

  const formsSlot = (
    <>
      <h2 className="section-title">Your intake {me.forms.length > 1 ? "forms" : "form"}</h2>
      <p className="section-desc">
        Share the right link with each client. The Informed Consent is included in every form, and
        completed forms appear under Dashboard.
      </p>
      <div className="form-cards">
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
      </div>
    </>
  );

  return (
    <div className="container">
      <DashboardShell
        name={me.name}
        initials={initials(me.name)}
        isAdmin={!!me.admin}
        needReview={needReview}
        items={items}
        formsSlot={formsSlot}
      />
    </div>
  );
}
