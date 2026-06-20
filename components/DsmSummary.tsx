import { scoreDsm } from "@/lib/dsm";

export default function DsmSummary({ answers }: { answers: Record<string, string> }) {
  const scores = scoreDsm(answers);
  const flagged = scores.filter((s) => s.flagged);
  const suicidal = scores.find((s) => s.domain.id === "suicidal");

  return (
    <div className="card">
      <h2 className="section-title">Symptom screen summary</h2>
      <p className="section-desc">
        Highest score per domain. Per APA guidance, a highest score of <strong>Mild (2)+</strong> -
        or <strong>Slight (1)+</strong> for Suicidal Ideation, Psychosis, and Substance Use - may
        warrant further inquiry. A screening aid, not a diagnosis.
      </p>

      {suicidal?.flagged && (
        <div className="dsm-urgent">
          ⚠ Suicidal ideation endorsed ({suicidal.highestLabel}). Review per your risk-assessment protocol.
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
              <span className="dsm-level">
                {s.highestLabel}
                {s.highest !== null ? ` (${s.highest})` : ""}
              </span>
              {s.flagged && (
                <span className={`badge ${s.domain.id === "suicidal" ? "badge-alert" : "badge-flag"}`}>
                  Follow up
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
