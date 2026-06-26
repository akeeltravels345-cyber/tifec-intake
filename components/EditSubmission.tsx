"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fieldVisible } from "@/lib/forms";
import type { FormSection } from "@/lib/forms";
import { Field } from "@/components/IntakeForm";

/**
 * Clinician-facing correction of a client's submitted answers. Renders the same
 * form fields pre-filled with the existing answers; saving overwrites the
 * encrypted record (the change is audit-logged server-side).
 */
export default function EditSubmission({
  token,
  sections,
  initialAnswers,
}: {
  token: string;
  sections: FormSection[];
  initialAnswers: Record<string, string>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(initialAnswers);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setValue(name: string, v: string) {
    setValues((prev) => ({ ...prev, [name]: v }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Persist only answers to currently-visible fields (drop stale hidden ones).
      const visible = new Set(
        sections.flatMap((s) => s.fields).filter((f) => fieldVisible(f, values)).map((f) => f.name)
      );
      const cleaned = Object.fromEntries(Object.entries(values).filter(([k]) => visible.has(k)));
      const res = await fetch("/api/submissions/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, answers: cleaned }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not save changes.");
      }
      router.push(`/submissions/${token}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      setSaving(false);
    }
  }

  return (
    <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="notice">
        ✏️ You are correcting this client&apos;s answers. Only fix genuine errors - the change is recorded in the access log.
      </div>

      {error && (
        <div className="card" style={{ borderColor: "var(--danger)" }}>
          <div className="error">{error}</div>
        </div>
      )}

      {sections.map((section) => {
        const fields = section.fields.filter((f) => fieldVisible(f, values));
        if (fields.length === 0) return null;
        return (
          <div className="card" key={section.id}>
            <h2 className="section-title">{section.title}</h2>
            {section.description && <p className="section-desc">{section.description}</p>}
            {fields.map((f) => (
              <Field key={f.name} field={f} value={values[f.name] || ""} onChange={setValue} />
            ))}
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button className="primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save corrections"}
        </button>
        <Link href={`/submissions/${token}`} className="back-link" style={{ margin: 0 }}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
