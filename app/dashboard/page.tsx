import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentClinician } from "@/lib/auth";
import { getSubmissionsByClinician, type SubmissionRow, type SubmissionStatus } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { templateLabel } from "@/lib/forms";
import ShareLink from "@/components/ShareLink";
import CoupleLink from "@/components/CoupleLink";
import ScreeningShare from "@/components/ScreeningShare";
import DashboardShell, { type DashItem } from "@/components/DashboardShell";
import { LEVEL2_MEASURES } from "@/lib/level2";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  new: "New",
  reviewed: "Reviewed",
  archived: "Archived",
};

// Icon, short description, and accent tint for each form type's card.
const FORM_META: Record<string, { icon: string; desc: string; bg: string }> = {
  individual: { icon: "👤", desc: "Standard intake for an individual client.", bg: "#d9edec" },
  couples: { icon: "💑", desc: "Each partner fills out their own form, linked together.", bg: "#e4e6f3" },
  "dsm5-level1-adult": { icon: "🧠", desc: "Brief 23-item cross-cutting symptom screen (adult).", bg: "#f6edd6" },
  "dsm5-level1-child": { icon: "🧒", desc: "Parent/guardian screen for a child age 6-17 (25 items).", bg: "#eaf3e4" },
  ...Object.fromEntries(
    LEVEL2_MEASURES.map((m) => [
      m.key,
      { icon: m.icon, desc: `In-depth follow-up for the ${m.domain.toLowerCase()} domain.`, bg: "#e9eef3" },
    ])
  ),
};

// Short, scannable label per form type for the submissions list.
const SHORT_FORM: Record<string, string> = {
  individual: "Individual Intake",
  couples: "Couples Intake",
  "dsm5-level1-adult": "DSM-5 Level 1",
  "dsm5-level1-child": "DSM-5 Child (6-17)",
  ...Object.fromEntries(LEVEL2_MEASURES.map((m) => [m.key, m.short])),
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
  // Grouped into clear families: intake, Level 1 screeners, Level 2 follow-ups,
  // and shareable tools - so the long list is easy to scan.
  const intakeForms = me.forms.filter((k) => k === "individual" || k === "couples");
  const level1Forms = me.forms.filter((k) => k.startsWith("dsm5-level1"));
  const level2Forms = me.forms.filter((k) => k.startsWith("l2-"));

  const formCard = (key: string) => {
    const meta = FORM_META[key];
    return (
      <div key={key} className="form-card">
        <div className="form-card-head">
          <div className="form-card-icon" style={{ background: meta?.bg }}>{meta?.icon ?? "📄"}</div>
          <div className="form-card-body">
            <div className="form-card-name">{templateLabel(key as never)}</div>
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
  };

  const group = (title: string, desc: string, keys: string[], first = false, extra: ReactNode = null) =>
    keys.length === 0 && !extra ? null : (
      <section style={{ maxWidth: 900, marginTop: first ? 0 : 30 }}>
        <h2 className="section-title" style={{ marginBottom: 2 }}>{title}</h2>
        <p className="section-desc" style={{ marginTop: 0, marginBottom: 12 }}>{desc}</p>
        <div className="form-cards">
          {keys.map(formCard)}
          {extra}
        </div>
      </section>
    );

  const selfCheckCard = me.selfCheck ? (
    <div className="form-card" key="selfcheck">
      <div className="form-card-head">
        <div className="form-card-icon" style={{ background: "#d9edec" }}>🧭</div>
        <div className="form-card-body">
          <div className="form-card-name">Wellbeing self-check (shareable)</div>
          <div className="form-card-desc">
            A public self-screening for talks, workshops, or groups. People see their own results on their own device -
            nothing is sent to you or stored.
          </div>
        </div>
      </div>
      <ScreeningShare />
    </div>
  ) : null;

  const formsSlot = (
    <>
      {group("Intake forms", "A client's first paperwork - Informed Consent is included automatically.", intakeForms, true)}
      {group(
        "Screening measures (Level 1)",
        "Brief DSM-5-TR cross-cutting symptom screens that flag which areas to look at next.",
        level1Forms
      )}
      {group(
        "Level 2 follow-up measures",
        "Send one when a Level 1 domain flags - a deeper, scored look at a single area.",
        level2Forms
      )}
      {group("Shareable tools", "Public self-checks for talks, workshops, and groups.", [], false, selfCheckCard)}
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
