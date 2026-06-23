import { getLevel2, scoreLevel2 } from "@/lib/level2";

/**
 * Clinician view of a completed DSM-5-TR Level 2 follow-up measure: a scored
 * headline (raw score, T-score for PROMIS, severity band) plus colour-coded
 * item responses. Works for all eight measures via lib/level2.ts config.
 */
export default function Level2Score({
  formKey,
  answers,
}: {
  formKey: string;
  answers: Record<string, string>;
}) {
  const m = getLevel2(formKey);
  const r = scoreLevel2(formKey, answers);
  if (!m || !r) return null;

  // Max possible raw (for non-PROMIS measures shown as "raw / max").
  const maxRaw = m.items.reduce((s, it) => {
    const sc = it.scale ?? m.scale;
    return s + Math.max(...sc.map((o) => o.value));
  }, 0);

  return (
    <>
      <div className="card">
        <h2 className="section-title">
          {m.tier === "severity" ? `${m.short} summary` : `${m.short.replace(/^L2 /, "")} follow-up summary`}
        </h2>
        <p className="section-desc">
          {m.tier === "severity"
            ? `${m.instrument} - tracks the severity of ${m.domain}. A screening aid, not a diagnosis.`
            : `${m.instrument} - follow-up for the “${m.domain}” domain. A screening aid, not a diagnosis.`}
        </p>

        {r.alert && <div className="dsm-urgent">⚠ {r.alert}</div>}

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "10px 0" }}>
          <span className={`sev sev-${r.sev}`} style={{ fontSize: "0.95rem", padding: "4px 12px" }}>
            {r.band}
          </span>
          <span style={{ fontWeight: 600 }}>
            Raw score: {r.raw}
            {r.tScore != null ? ` · T-score ${r.tScore.toFixed(1)}` : ` / ${maxRaw}`}
          </span>
          {r.flagged && <span className="badge badge-flag">Follow up</span>}
        </div>

        <p className="section-desc" style={{ marginBottom: r.used && r.used.length ? 8 : 0 }}>{r.note}</p>

        {r.used && r.used.length > 0 && (
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {r.used.map((u) => (
              <li key={u} style={{ marginBottom: 2 }}>{u}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2 className="section-title">Responses</h2>
        <p className="section-desc">Each answer is shaded by severity (green = low, red = high).</p>
        <div className="dsm2">
          {r.items.map((it, i) => (
            <div className="dsm2-row" key={i}>
              <span className="dsm2-q">
                {i + 1}. {it.text}
              </span>
              <span className={`sev sev-${it.bucket ?? "na"}`}>{it.answer || "—"}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
