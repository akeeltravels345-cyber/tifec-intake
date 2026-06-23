import { DSM_CHILD_DOMAINS, scoreDsmChild } from "@/lib/dsmChild";

const LEVELS = ["None", "Slight", "Mild", "Moderate", "Severe"];

// Colour class for a Yes/No/Don't Know answer (substance use + suicidal items).
function ynClass(v: string): string {
  const s = (v || "").trim().toLowerCase();
  if (s === "yes") return "sev-4";
  if (s.startsWith("don")) return "sev-2";
  if (s === "no") return "sev-0";
  return "sev-na";
}

/**
 * Clinician view of a completed DSM-5-TR Parent/Guardian Level 1 (Child 6-17):
 * a flagged-domain summary plus colour-coded responses grouped by domain.
 */
export default function DsmChild({
  answers,
  labels,
}: {
  answers: Record<string, string>;
  labels: Record<string, string>;
}) {
  const scores = scoreDsmChild(answers);
  const flagged = scores.filter((s) => s.flagged);
  const suicidal = scores.find((s) => s.domain.id === "suicidal");

  return (
    <>
      <div className="card">
        <h2 className="section-title">Symptom screen summary (child 6-17)</h2>
        <p className="section-desc">
          Highest score per domain (parent/guardian rated). Per APA guidance, <strong>Mild (2)+</strong> - or
          <strong> Slight (1)+</strong> for Inattention and Psychosis, and any <strong>Yes / Don&apos;t Know</strong> for
          Substance Use and Suicidal Ideation - may warrant further inquiry. A screening aid, not a diagnosis.
        </p>

        {suicidal?.flagged && (
          <div className="dsm-urgent">
            ⚠ Suicidal ideation or attempt endorsed ({suicidal.display}). Review per your risk-assessment protocol.
          </div>
        )}

        <p className="section-desc" style={{ marginBottom: 8 }}>
          {flagged.length === 0
            ? "No domains reached the threshold for further inquiry."
            : `${flagged.length} domain${flagged.length > 1 ? "s" : ""} flagged for further inquiry.`}
        </p>

        <div className="dsm-grid">
          {scores.map((s) => (
            <div key={s.domain.id} className={`dsm-row ${s.flagged ? "flagged" : ""}`}>
              <div className="dsm-name">
                <span className="dsm-roman">{s.domain.roman}.</span> {s.domain.name}
              </div>
              <div className="dsm-score">
                <span className="dsm-level">{s.display}</span>
                {s.flagged && (
                  <span className={`badge ${s.domain.id === "suicidal" ? "badge-alert" : "badge-flag"}`}>Follow up</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="section-title">Responses by domain</h2>
        <p className="section-desc">Each answer is shaded by severity (green = none, red = severe).</p>
        <div className="dsm2">
          {DSM_CHILD_DOMAINS.map((d) => (
            <div className="dsm2-group" key={d.id}>
              <div className="dsm2-domain">
                <span className="dsm2-roman">{d.roman}.</span> {d.name}
              </div>
              {d.items.map((n) => {
                const raw = answers[`cq${n}`];
                let cls = "sev-na";
                let text = "N/A";
                if (raw != null && raw !== "") {
                  if (d.yesno) {
                    cls = ynClass(raw);
                    text = raw;
                  } else {
                    const score = parseInt(raw, 10);
                    if (!Number.isNaN(score) && score >= 0 && score <= 4) {
                      cls = `sev-${score}`;
                      text = `${score} · ${LEVELS[score]}`;
                    }
                  }
                }
                return (
                  <div className="dsm2-row" key={n}>
                    <span className="dsm2-q">{labels[`cq${n}`] || `Question ${n}`}</span>
                    <span className={`sev ${cls}`}>{text}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
