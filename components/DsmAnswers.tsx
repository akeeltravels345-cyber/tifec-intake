import { DSM_DOMAINS, scoreDsm } from "@/lib/dsm";

const LEVELS = ["None", "Slight", "Mild", "Moderate", "Severe"];

/**
 * Clinician-friendly view of a completed DSM-5-TR Level 1 measure:
 * questions grouped by the 13 domains, each response shown as a colour-coded
 * severity pill (green → red), and the domain flagged when it meets the
 * threshold for further inquiry.
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
      <p className="section-desc">Each answer is shaded by severity (green = none, red = severe).</p>

      <div className="dsm-answers">
        {DSM_DOMAINS.map((d) => {
          const isFlagged = flagged.get(d.id);
          return (
            <div className={`dsm-domain ${isFlagged ? "flagged" : ""}`} key={d.id}>
              <div className="dsm-domain-head">
                <span>
                  <span className="dsm-roman">{d.roman}.</span> {d.name}
                </span>
                {isFlagged && <span className="badge badge-flag">Follow up</span>}
              </div>
              {d.items.map((n) => {
                const raw = answers[`dsm_q${n}`];
                const score = raw ? parseInt(raw, 10) : NaN;
                const valid = !Number.isNaN(score) && score >= 0 && score <= 4;
                return (
                  <div className="dsm-q-row" key={n}>
                    <div className="dsm-q-text">
                      {labels[`dsm_q${n}`] || `Question ${n}`}
                      {examples?.[`dsm_q${n}`] && <span className="q-sub">{examples[`dsm_q${n}`]}</span>}
                    </div>
                    <span className={`sev sev-${valid ? score : "na"}`}>
                      {valid ? `${score} · ${LEVELS[score]}` : "-"}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
