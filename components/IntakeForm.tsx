"use client";

import { useEffect, useState } from "react";
import { fieldVisible } from "@/lib/forms";
import type { FormField, FormSection } from "@/lib/forms";

const draftKey = (clinicianId: string, formKey: string) => `tifec-draft-${clinicianId}-${formKey}`;

export interface ClinicianForm {
  key: string;
  label: string;
  sections: FormSection[];
}

export interface ClinicianLite {
  id: string;
  name: string;
  credentials: string;
  forms: ClinicianForm[];
}

export default function IntakeForm({
  clinicians,
  initialClinicianId,
  initialFormKey,
  coupleId,
}: {
  clinicians: ClinicianLite[];
  initialClinicianId?: string;
  initialFormKey?: string;
  coupleId?: string;
}) {
  const [clinicianId, setClinicianId] = useState<string>(
    initialClinicianId && clinicians.some((c) => c.id === initialClinicianId) ? initialClinicianId : ""
  );
  const [formKey, setFormKey] = useState<string>(initialFormKey || "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [invalid, setInvalid] = useState<Set<string>>(new Set());

  const selected = clinicians.find((c) => c.id === clinicianId);
  const forms = selected?.forms ?? [];
  // Auto-select when the clinician offers exactly one form.
  const effectiveFormKey = formKey || (forms.length === 1 ? forms[0].key : "");
  const selectedForm = forms.find((f) => f.key === effectiveFormKey);
  const sections = selectedForm?.sections ?? [];

  // Load any saved draft once a clinician + form are chosen.
  useEffect(() => {
    if (!clinicianId || !effectiveFormKey) return;
    try {
      const saved = localStorage.getItem(draftKey(clinicianId, effectiveFormKey));
      const parsed = saved ? JSON.parse(saved) : null;
      if (parsed && typeof parsed === "object" && Object.keys(parsed).length) {
        setValues(parsed);
        setDraftRestored(true);
      } else {
        setValues({});
        setDraftRestored(false);
      }
    } catch {
      setValues({});
    }
  }, [clinicianId, effectiveFormKey]);

  // Autosave the draft locally as the client types (never leaves their device).
  useEffect(() => {
    if (!clinicianId || !effectiveFormKey || done) return;
    try {
      if (Object.keys(values).length) {
        localStorage.setItem(draftKey(clinicianId, effectiveFormKey), JSON.stringify(values));
      }
    } catch {
      /* storage full / disabled - non-fatal */
    }
  }, [values, clinicianId, effectiveFormKey, done]);

  function setValue(name: string, v: string) {
    setValues((prev) => ({ ...prev, [name]: v }));
    // Clear the "missing" highlight once the client provides an answer.
    setInvalid((prev) => {
      if (!prev.has(name)) return prev;
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
  }

  function startOver() {
    try {
      localStorage.removeItem(draftKey(clinicianId, effectiveFormKey));
    } catch {
      /* ignore */
    }
    setValues({});
    setDraftRestored(false);
  }

  /** Names of every visible required question that hasn't been answered. */
  function missingRequired(): string[] {
    const missing: string[] = [];
    for (const section of sections) {
      for (const f of section.fields) {
        if (f.type === "statement" || !f.required) continue;
        if (!fieldVisible(f, values)) continue; // hidden conditional fields aren't required
        const v = values[f.name];
        const empty = f.type === "checkbox" ? v !== "true" : !v || !v.trim();
        if (empty) missing.push(f.name);
      }
    }
    return missing;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const missing = missingRequired();
    if (missing.length > 0) {
      setInvalid(new Set(missing));
      setError(
        `Please answer the ${missing.length} required question${missing.length > 1 ? "s" : ""} highlighted below before submitting.`
      );
      // Jump to the first unanswered question.
      const el = document.getElementById(`field-${missing[0]}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setInvalid(new Set());
    setSubmitting(true);
    try {
      // Only submit answers to currently-visible fields (drop stale hidden ones).
      const visibleNames = new Set(
        sections.flatMap((s) => s.fields).filter((f) => fieldVisible(f, values)).map((f) => f.name)
      );
      const cleaned = Object.fromEntries(
        Object.entries(values).filter(([k]) => visibleNames.has(k))
      );
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicianId, formKey: effectiveFormKey, coupleId, answers: cleaned }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Submission failed. Please try again.");
      }
      try {
        localStorage.removeItem(draftKey(clinicianId, effectiveFormKey));
      } catch {
        /* ignore */
      }
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="card center">
        <div className="success-check">✓</div>
        <h2 className="section-title">Thank you - your form was submitted</h2>
        <p className="muted">
          {selected?.name} has been notified and will review your information before your
          appointment. You may close this page.
        </p>
      </div>
    );
  }

  // Step 1: choose a clinician
  if (!selected) {
    return (
      <div className="card">
        <h2 className="section-title">Who are you here to see?</h2>
        <p className="section-desc">Select your clinician to begin.</p>
        <div className="clinician-grid">
          {clinicians.map((c) => (
            <div
              key={c.id}
              className="clinician-option"
              onClick={() => {
                setClinicianId(c.id);
                setFormKey("");
              }}
            >
              <input type="radio" name="clinician" checked={clinicianId === c.id} readOnly />
              <div>
                <div className="name">{c.name}</div>
                <div className="cred">{c.credentials}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Step 2: choose which form (only when the clinician offers more than one)
  if (!selectedForm) {
    return (
      <div className="card">
        <h2 className="section-title">Which form are you completing?</h2>
        <p className="section-desc">For {selected.name} ({selected.credentials})</p>
        <div className="clinician-grid">
          {forms.map((f) => (
            <div key={f.key} className="clinician-option" onClick={() => setFormKey(f.key)}>
              <input type="radio" name="form" checked={effectiveFormKey === f.key} readOnly />
              <div>
                <div className="name">{f.label}</div>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="primary"
          style={{ background: "transparent", color: "var(--brand)", padding: 0, marginTop: 12 }}
          onClick={() => setClinicianId("")}
        >
          ← Change clinician
        </button>
      </div>
    );
  }

  // Step 3: the form
  const requiredFields = sections
    .flatMap((s) => s.fields)
    .filter((f) => f.required && f.type !== "statement" && fieldVisible(f, values));
  const filledCount = requiredFields.filter((f) =>
    f.type === "checkbox" ? values[f.name] === "true" : (values[f.name] || "").trim() !== ""
  ).length;
  const pct = requiredFields.length ? Math.round((filledCount / requiredFields.length) * 100) : 0;

  return (
    <form onSubmit={handleSubmit}>
      <div className="notice">
        🔒 Your responses are encrypted and shared only with your clinician. If you are in crisis,
        call <strong>911</strong> or go to your nearest emergency room - this form is not
        monitored in real time.
      </div>

      {draftRestored && (
        <div className="draft-banner">
          <span>We restored your saved progress on this device.</span>
          <button type="button" onClick={startOver}>Start over</button>
        </div>
      )}

      <div className="card">
        <h2 className="section-title">{selectedForm.label}</h2>
        <p className="section-desc">For {selected.name} · {selected.credentials}</p>
        <div style={{ display: "flex", gap: 16 }}>
          {forms.length > 1 && (
            <button
              type="button"
              className="primary"
              style={{ background: "transparent", color: "var(--brand)", padding: 0 }}
              onClick={() => setFormKey("")}
            >
              ← Change form
            </button>
          )}
          <button
            type="button"
            className="primary"
            style={{ background: "transparent", color: "var(--brand)", padding: 0 }}
            onClick={() => { setClinicianId(""); setFormKey(""); }}
          >
            ← Change clinician
          </button>
        </div>
      </div>

      <div className="form-progress">
        <div className="form-progress-bar">
          <div className="form-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="form-progress-text">
          {filledCount} of {requiredFields.length} required questions answered · {pct}%
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: "var(--danger)" }}>
          <div className="error">{error}</div>
        </div>
      )}

      {sections.map((section) => (
        <div className="card" key={section.id}>
          {section.titleBelowIntro ? (
            <>
              {section.intro?.map((p, idx) => (
                <p key={idx} className="consent-text">{p}</p>
              ))}
              <h2 className="section-title" style={{ marginTop: 6 }}>{section.title}</h2>
              {section.description && <p className="section-desc">{section.description}</p>}
            </>
          ) : (
            <>
              <h2 className="section-title">{section.title}</h2>
              {section.description && <p className="section-desc">{section.description}</p>}
              {section.intro?.map((p, idx) => (
                <p key={idx} className="consent-text">{p}</p>
              ))}
            </>
          )}
          {section.fields
            .filter((f) => fieldVisible(f, values))
            .map((f) => (
              <Field key={f.name} field={f} value={values[f.name] || ""} onChange={setValue} invalid={invalid.has(f.name)} />
            ))}
        </div>
      ))}

      <button className="primary" type="submit" disabled={submitting}>
        {submitting ? "Submitting…" : "Submit intake form"}
      </button>
    </form>
  );
}

function Field({
  field: f,
  value,
  onChange,
  invalid,
}: {
  field: FormField;
  value: string;
  onChange: (name: string, v: string) => void;
  invalid?: boolean;
}) {
  const id = `f_${f.name}`;
  const labelEl = (
    <label className="q" htmlFor={id}>
      {f.label} {f.required && <span className="req">*</span>}
      {f.examples && <span className="q-examples">{f.examples}</span>}
    </label>
  );

  // Statements collect no value and are never required.
  if (f.type === "statement") {
    return <p className="consent-text">{f.label}</p>;
  }

  // Common wrapper: anchors the field for scroll-to, shows the help text, and
  // highlights + flags the question when it's a missing required answer.
  const wrap = (inner: React.ReactNode) => (
    <div className={`field ${invalid ? "invalid" : ""}`} id={`field-${f.name}`}>
      {inner}
      {f.help && <p className="help">{f.help}</p>}
      {invalid && <p className="field-required">This question is required.</p>}
    </div>
  );

  if (f.type === "checkbox") {
    return wrap(
      <div className="choice">
        <input
          id={id}
          type="checkbox"
          checked={value === "true"}
          onChange={(e) => onChange(f.name, e.target.checked ? "true" : "")}
        />
        <span>
          {f.label} {f.required && <span className="req">*</span>}
        </span>
      </div>
    );
  }

  if (f.type === "checkboxgroup") {
    const selectedSet = value ? value.split(", ") : [];
    const toggle = (opt: string) => {
      const next = selectedSet.includes(opt)
        ? selectedSet.filter((x) => x !== opt)
        : [...selectedSet, opt];
      onChange(f.name, next.join(", "));
    };
    return wrap(
      <>
        {labelEl}
        <div className="seg">
          {f.options?.map((o) => (
            <label key={o} className={`seg-option ${selectedSet.includes(o) ? "selected" : ""}`}>
              <input className="seg-input" type="checkbox" checked={selectedSet.includes(o)} onChange={() => toggle(o)} />
              <span>{o}</span>
            </label>
          ))}
        </div>
      </>
    );
  }

  if (f.type === "textarea") {
    return wrap(
      <>
        {labelEl}
        <textarea id={id} value={value} placeholder={f.placeholder} onChange={(e) => onChange(f.name, e.target.value)} />
      </>
    );
  }

  if (f.type === "select") {
    return wrap(
      <>
        {labelEl}
        <select id={id} value={value} onChange={(e) => onChange(f.name, e.target.value)}>
          <option value="">- Select -</option>
          {f.options?.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </>
    );
  }

  if (f.type === "radio") {
    return wrap(
      <>
        {labelEl}
        <div className={`seg ${f.stack ? "seg-stack" : ""}`}>
          {f.options?.map((o) => (
            <label key={o} className={`seg-option ${value === o ? "selected" : ""}`}>
              <input className="seg-input" type="radio" name={f.name} checked={value === o} onChange={() => onChange(f.name, o)} />
              <span>{o}</span>
            </label>
          ))}
        </div>
      </>
    );
  }

  // text / email / tel / date / number
  return wrap(
    <>
      {labelEl}
      <input
        id={id}
        type={f.type === "number" ? "number" : f.type}
        value={value}
        placeholder={f.placeholder}
        onChange={(e) => onChange(f.name, e.target.value)}
      />
    </>
  );
}
