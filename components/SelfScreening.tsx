"use client";

import { useMemo, useState } from "react";
import { buildSections, type FormField } from "@/lib/forms";
import { scoreDsm, DSM_DOMAINS } from "@/lib/dsm";

const LEVELS = ["None", "Slight", "Mild", "Moderate", "Severe"];

const optVal = (o: unknown) => (typeof o === "string" ? o : ((o as { value?: string; label?: string })?.value ?? (o as { label?: string })?.label ?? ""));
const optLabel = (o: unknown) => (typeof o === "string" ? o : ((o as { label?: string; value?: string })?.label ?? (o as { value?: string })?.value ?? ""));

// The 23 symptom items (0-4 scale, with any examples) from the DSM template.
function getItems(): FormField[] {
  const sections = buildSections("dsm5-level1-adult", []);
  const sym = sections.find((s) => s.id === "dsm-symptoms");
  return (sym?.fields ?? []).filter((f) => f.name.startsWith("dsm_q"));
}

export default function SelfScreening() {
  const items = useMemo(getItems, []);
  const [step, setStep] = useState<"intro" | "form" | "results">("intro");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [invalid, setInvalid] = useState<Set<string>>(new Set());

  const labelFor = (name: string) => items.find((f) => f.name === name)?.label || name;
  const exampleFor = (name: string) => items.find((f) => f.name === name)?.examples;

  function setAns(name: string, v: string) {
    setAnswers((a) => ({ ...a, [name]: v }));
    setInvalid((s) => {
      const n = new Set(s);
      n.delete(name);
      return n;
    });
  }

  function seeResults() {
    const missing = items.filter((f) => !answers[f.name]);
    if (missing.length) {
      setInvalid(new Set(missing.map((f) => f.name)));
      document.getElementById(`q-${missing[0].name}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setStep("results");
    window.scrollTo(0, 0);
  }

  function restart() {
    setAnswers({});
    setInvalid(new Set());
    setStep("intro");
    window.scrollTo(0, 0);
  }

  // ----------------------------------------------------------------- intro
  if (step === "intro") {
    return (
      <div className="card">
        <span className="type-chip">Wellbeing self-check</span>
        <h1 className="hero-title" style={{ fontSize: 26 }}>How are you really doing?</h1>
        <p className="hero-sub" style={{ margin: "10px 0 0" }}>
          A short, confidential check-in based on a standard mental-health screening tool (the DSM-5-TR Level 1).
          It takes about 3–5 minutes.
        </p>
        <div className="notice" style={{ marginTop: 18 }}>
          <strong>🔒 Your answers stay on your device.</strong> Nothing is saved, sent, or shared — when you finish you&apos;ll
          simply see your own results on this screen.
        </div>
        <p className="consent-text">
          This is for your own awareness and is <strong>not a diagnosis</strong>. If anything here concerns you, please
          speak with a qualified professional.
        </p>
        <p className="consent-text">
          If you are in crisis or thinking about hurting yourself, call <strong>911</strong> or go to your nearest
          emergency room.
        </p>
        <button className="primary primary-lg" style={{ marginTop: 8 }} onClick={() => setStep("form")}>
          Begin self-check →
        </button>
      </div>
    );
  }

  // --------------------------------------------------------------- results
  if (step === "results") {
    const scores = scoreDsm(answers);
    const flagged = scores.filter((s) => s.flagged);
    const suicidal = scores.find((s) => s.domain.id === "suicidal");
    return (
      <>
        <div className="card">
          <span className="type-chip">Your results</span>
          <h1 className="hero-title" style={{ fontSize: 24 }}>Your wellbeing snapshot</h1>
          <p className="section-desc" style={{ marginTop: 8 }}>
            These results are just for you. A higher score in an area isn&apos;t a diagnosis — it simply points to
            something you might want to talk through with a professional.
          </p>

          {suicidal?.flagged && (
            <div className="dsm-urgent">
              ⚠ Your responses mention thoughts of hurting yourself. Please reach out — call <strong>911</strong>, go
              to your nearest emergency room, or talk to someone you trust. You don&apos;t have to face this alone.
            </div>
          )}

          <p className="section-desc" style={{ marginBottom: 8 }}>
            {flagged.length === 0
              ? "None of the areas reached a level that usually suggests follow-up — that&apos;s a good sign."
              : `${flagged.length} area${flagged.length > 1 ? "s" : ""} may be worth discussing with a professional.`}
          </p>

          <div className="dsm-grid">
            {scores.map((s) => (
              <div key={s.domain.id} className={`dsm-row ${s.flagged ? "flagged" : ""}`}>
                <div className="dsm-name">
                  <span className="dsm-roman">{s.domain.roman}.</span> {s.domain.name}
                </div>
                <div className="dsm-score">
                  <span className="dsm-level">
                    {s.highestLabel}
                    {s.highest !== null ? ` (${s.highest})` : ""}
                  </span>
                  {s.flagged && (
                    <span className={`badge ${s.domain.id === "suicidal" ? "badge-alert" : "badge-flag"}`}>
                      Worth a look
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="section-title">Your answers in detail</h2>
          <p className="section-desc">Each answer is shaded by severity (green = none → red = severe).</p>
          <div className="dsm2">
            {DSM_DOMAINS.map((d) => (
              <div className="dsm2-group" key={d.id}>
                <div className="dsm2-domain">
                  <span className="dsm2-roman">{d.roman}.</span> {d.name}
                </div>
                {d.items.map((n) => {
                  const raw = answers[`dsm_q${n}`];
                  const score = raw ? parseInt(raw, 10) : NaN;
                  const valid = !Number.isNaN(score) && score >= 0 && score <= 4;
                  return (
                    <div className="dsm2-row" key={n}>
                      <span className="dsm2-q">
                        {labelFor(`dsm_q${n}`)}
                        {exampleFor(`dsm_q${n}`) && <span className="q-sub">{exampleFor(`dsm_q${n}`)}</span>}
                      </span>
                      <span className={`sev sev-${valid ? score : "na"}`}>
                        {valid ? `${score} · ${LEVELS[score]}` : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ textAlign: "center" }}>
          <p className="section-desc" style={{ margin: "0 0 14px" }}>
            Remember: this is a screening aid, not a diagnosis. Your answers were never sent anywhere.
          </p>
          <button className="btn-outline-lg" onClick={restart}>Start over</button>
        </div>
      </>
    );
  }

  // ------------------------------------------------------------------ form
  const answeredCount = items.filter((f) => answers[f.name]).length;
  return (
    <>
      <div className="form-progress">
        <div className="form-progress-bar">
          <div className="form-progress-fill" style={{ width: `${Math.round((answeredCount / items.length) * 100)}%` }} />
        </div>
        <div className="form-progress-text">
          {answeredCount} of {items.length} answered
        </div>
      </div>

      <div className="card">
        <p className="consent-text">
          The questions below ask about things that might have bothered you. For each one, choose the response that
          best describes how much (or how often) it bothered you during the past TWO (2) WEEKS.
        </p>
        <p className="consent-text">
          If you are in crisis or thinking about hurting yourself, call <strong>911</strong> or go to your nearest
          emergency room — this is not monitored.
        </p>
        <h2 className="section-title" style={{ marginTop: 6, marginBottom: 18 }}>
          During the past TWO (2) WEEKS, how much (or how often) have you been bothered by…
        </h2>

        {items.map((f) => {
          const opts = (f.options ?? []) as unknown[];
          return (
            <div className={`field ${invalid.has(f.name) ? "invalid" : ""}`} id={`q-${f.name}`} key={f.name}>
              <label className="q">
                {f.label}
                {f.examples && <span className="q-examples">{f.examples}</span>}
              </label>
              <div className="seg seg-stack">
                {opts.map((opt) => {
                  const val = optVal(opt);
                  const selected = answers[f.name] === val;
                  return (
                    <label key={val} className={`seg-option ${selected ? "selected" : ""}`}>
                      <input
                        className="seg-input"
                        type="radio"
                        name={f.name}
                        checked={selected}
                        onChange={() => setAns(f.name, val)}
                      />
                      {optLabel(opt)}
                    </label>
                  );
                })}
              </div>
              {invalid.has(f.name) && <p className="field-required">Please choose an answer.</p>}
            </div>
          );
        })}

        <button className="primary primary-lg" style={{ marginTop: 8 }} onClick={seeResults}>
          See my results →
        </button>
      </div>
    </>
  );
}
