import { DSM_DOMAINS, scoreDsm } from "@/lib/dsm";

const LEVELS = ["None", "Slight", "Mild", "Moderate", "Severe"];

/**
 * Clinician-friendly view of a completed DSM-5-TR Level 1 measure:
 * questions grouped by domain, each response a colour-coded severity pill.
 * Flagged domains get a small dot (the full follow-up list is in the summary
 * card above), keeping this section calm and scannable.
 */
export default function DsmAnswers({
  answers,
  labels,
  examples,
}: {
  answers: Record<string, string>;
  labels: Record<string, string>;
  examples?: Record<string, string>;
}) {
  const flagged = new Map(scoreDsm(answers).map((s) => [s.domain.id, s.flagged]));

  return (
    <div className="card">
      <h2 className="section-title">Responses by domain</h2>
      <p className="section-desc">Each answer is shaded by severity (green = none → red = severe).</p>

      <div className="dsm2">
        {DSM_DOMAINS.map((d) => (
          <div className="dsm2-group" key={d.id}>
            <div className="dsm2-domain">
              <span className="dsm2-roman">{d.roman}.</span> {d.name}
              {flagged.get(d.id) && (
                <span className="dsm2-flag" title="Meets threshold for follow-up">● follow up</span>
              )}
            </div>
            {d.items.map((n) => {
              const raw = answers[`dsm_q${n}`];
              const score = raw ? parseInt(raw, 10) : NaN;
              const valid = !Number.isNaN(score) && score >= 0 && score <= 4;
              return (
                <div className="dsm2-row" key={n}>
                  <span className="dsm2-q">
                    {labels[`dsm_q${n}`] || `Question ${n}`}
                    {examples?.[`dsm_q${n}`] && <span className="q-sub">{examples[`dsm_q${n}`]}</span>}
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
  );
}
