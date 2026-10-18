"use client";

import { useMemo, useState } from "react";
import type { HipaaBoardItem, HipaaStatus, HipaaComment, HipaaSafeguard } from "@/lib/hipaa";

const STATUS_LABEL: Record<HipaaStatus, string> = { todo: "To do", doing: "In progress", done: "Done", blocked: "Blocked" };
const STATUS_ORDER: HipaaStatus[] = ["todo", "doing", "done", "blocked"];
const PRIORITY_LABEL: Record<string, string> = { now: "Do first", soon: "Soon", later: "Later" };

function fmt(at: string): string {
  const d = new Date(at);
  if (isNaN(d.getTime())) return "";
  // Pin to Cayman time so the date reads the same for everyone, not the viewer's tz.
  return d.toLocaleString("en-GB", { timeZone: "America/Cayman", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function HipaaBoard({ board, safeguards, meId, meName }: { board: HipaaBoardItem[]; safeguards: HipaaSafeguard[]; meId: string; meName: string }) {
  const [items, setItems] = useState(board);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState<string>("");

  const done = items.filter((i) => i.status === "done").length;
  const pct = Math.round((done / items.length) * 100);
  const counts = useMemo(() => {
    const c: Record<HipaaStatus, number> = { todo: 0, doing: 0, done: 0, blocked: 0 };
    for (const i of items) c[i.status]++;
    return c;
  }, [items]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/hipaa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  async function changeStatus(taskId: string, status: HipaaStatus) {
    const prev = items;
    setItems((xs) => xs.map((x) => (x.id === taskId ? { ...x, status } : x)));
    setErr("");
    try { await post({ action: "status", taskId, status }); }
    catch (e) { setItems(prev); setErr(e instanceof Error ? e.message : "Could not save."); }
  }

  async function addComment(taskId: string) {
    const text = (drafts[taskId] ?? "").trim();
    if (!text) return;
    setBusy(taskId); setErr("");
    try {
      const { comment } = (await post({ action: "comment", taskId, text })) as { comment: HipaaComment };
      setItems((xs) => xs.map((x) => (x.id === taskId ? { ...x, comments: [...x.comments, comment] } : x)));
      setDrafts((d) => ({ ...d, [taskId]: "" }));
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not add the note."); }
    finally { setBusy(""); }
  }

  // Done tasks move up into "Already in place"; only the rest stay in "Still to do".
  const pending = items.filter((i) => i.status !== "done");
  const doneTasks = items.filter((i) => i.status === "done");

  function renderTask(t: HipaaBoardItem) {
    return (
      <li key={t.id} className={`hp-task ${t.status}`}>
        <div className="hp-task-head">
          <span className={`hp-dot big ${t.status}`} />
          <div className="hp-task-title">
            <span className="hp-tt">{t.title}</span>
            <span className="hp-tags">
              <span className="hp-cat">{t.category}</span>
              {t.priority && <span className={`hp-pri ${t.priority}`}>{PRIORITY_LABEL[t.priority] ?? t.priority}</span>}
            </span>
          </div>
          <select className={`hp-status ${t.status}`} value={t.status} onChange={(e) => changeStatus(t.id, e.target.value as HipaaStatus)} aria-label={`Status for ${t.title}`}>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>

        <p className="hp-detail">{t.detail}</p>

        <div className="hp-notes">
          {t.comments.length > 0 && (
            <ul className="hp-comments">
              {t.comments.map((c) => (
                <li key={c.id}>
                  <div className="hp-c-meta"><span className="hp-c-by">{c.byName || "Someone"}</span><span className="hp-c-at">{fmt(c.at)}</span></div>
                  <div className="hp-c-text">{c.text}</div>
                </li>
              ))}
            </ul>
          )}
          <div className="hp-addnote">
            <input
              className="hp-note-in"
              placeholder="Add a progress note…"
              value={drafts[t.id] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addComment(t.id); } }}
            />
            <button type="button" className="hp-note-btn" onClick={() => addComment(t.id)} disabled={busy === t.id || !(drafts[t.id] ?? "").trim()}>{busy === t.id ? "Saving…" : "Add"}</button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <div className="hp-wrap">
      <header className="hp-head">
        <h1 className="hp-h1">HIPAA compliance</h1>
        <p className="hp-sub">Where the practice stands on protecting health information, and what&apos;s left. Update a status or add a progress note — you and Akeel share this board.</p>
      </header>

      <div className="hp-progress">
        <div className="hp-prog-top">
          <span className="hp-prog-lab">{done} of {items.length} done</span>
          <span className="hp-prog-pct">{pct}%</span>
        </div>
        <div className="hp-prog-bar"><span style={{ width: `${pct}%` }} /></div>
        <div className="hp-prog-counts">
          {STATUS_ORDER.map((s) => counts[s] > 0 && (
            <span key={s} className={`hp-count ${s}`}><i className={`hp-dot ${s}`} />{counts[s]} {STATUS_LABEL[s].toLowerCase()}</span>
          ))}
        </div>
      </div>

      {err && <p className="hp-err">{err}</p>}

      <style>{`
        .hpx-p{margin:0 0 12px;max-width:72ch;font-size:15px;line-height:1.6}
        .hpx-rule{font-size:14px;color:var(--muted,#6b7679);background:var(--surface-2,#eef2f6);border:1px solid var(--line,#e3e9ed);border-radius:10px;padding:12px 14px;margin:6px 0 20px}
        .hpx-layers{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px}
        @media (max-width:640px){.hpx-layers{grid-template-columns:1fr}}
        .hpx-layer{background:var(--surface,#fff);border:1px solid var(--line,#e3e9ed);border-radius:12px;padding:16px}
        .hpx-tag{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 9px;border-radius:6px;margin-bottom:10px}
        .hpx-tag.bind{color:#2e3192;background:#ecedff}
        .hpx-tag.best{color:#1f6b6f;background:#dcefef}
        .hpx-layer h4{margin:0 0 2px;font-size:16px}
        .hpx-role{font-size:13px;color:var(--muted,#6b7679);margin:0 0 10px}
        .hpx-layer ul{margin:0;padding-left:18px}
        .hpx-layer li{font-size:13.5px;line-height:1.45;margin-bottom:7px}
        .hpx-tablewrap{overflow-x:auto;border:1px solid var(--line,#e3e9ed);border-radius:12px}
        .hpx-table{border-collapse:collapse;width:100%;min-width:680px;font-size:13px}
        .hpx-table th{text-align:left;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#6b7679);font-weight:600;padding:11px 13px;background:var(--surface-2,#eef2f6);border-bottom:1px solid var(--line,#e3e9ed)}
        .hpx-table td{padding:12px 13px;border-top:1px solid var(--line,#e3e9ed);vertical-align:top;line-height:1.4}
        .hpx-table td.area{font-weight:600;white-space:nowrap}
        .hpx-led{display:inline-block;font-size:10px;font-weight:700;color:#1f6b6f;background:#dcefef;border-radius:5px;padding:1px 6px;margin-left:6px;white-space:nowrap}
      `}</style>

      <section className="hp-sec">
        <h2 className="hp-sech">How this works: Cayman law + HIPAA</h2>
        <p className="hp-secsub">The compliance model behind this board. Cayman law is what binds the practice; HIPAA is the framework we borrow to meet it to a high standard.</p>

        <p className="hpx-p">We do not have to choose between HIPAA and Cayman law. <strong>Cayman law is what actually binds us</strong>: it sets the definitions, the regulator we answer to, and the deadlines we must meet. <strong>HIPAA is the framework we borrow to put that into practice</strong>, a mature, well documented system of controls and paperwork we adopt to meet Cayman&apos;s requirements to a defensible standard.</p>
        <div className="hpx-rule"><strong>Rule of thumb:</strong> when the two differ on <em>what</em> is required, Cayman wins. When we need to decide <em>how</em> to do it well, we follow HIPAA.</div>

        <div className="hpx-layers">
          <div className="hpx-layer">
            <span className="hpx-tag bind">Foundation, binding</span>
            <h4>Cayman law</h4>
            <p className="hpx-role">What we are legally required to do.</p>
            <ul>
              <li><strong>Data Protection Act (2021 Revision)</strong>, overseen by the Ombudsman: eight data-protection principles, patient rights, breach notification, limits on sending data overseas.</li>
              <li><strong>Professional confidentiality</strong>, the duty clinicians owe under their codes and common law.</li>
              <li><strong>Health Insurance Law</strong>, relevant to billing and claims.</li>
            </ul>
          </div>
          <div className="hpx-layer">
            <span className="hpx-tag best">Overlay, best practice</span>
            <h4>HIPAA</h4>
            <p className="hpx-role">The framework we adopt to do it well.</p>
            <ul>
              <li><strong>Privacy Rule</strong>: how health information may be used and shared, the &quot;minimum necessary&quot; habit, a complete privacy notice.</li>
              <li><strong>Security Rule</strong>: a concrete checklist of administrative, physical and technical safeguards, plus a written risk assessment.</li>
              <li><strong>Breach Notification Rule</strong> and the <strong>Business Associate</strong> model for vendors who touch patient data.</li>
            </ul>
          </div>
        </div>

        <div className="hpx-tablewrap">
          <table className="hpx-table">
            <thead><tr><th>Area</th><th>Cayman DPA (binding)</th><th>HIPAA adds</th><th>Our meshed standard</th></tr></thead>
            <tbody>
              <tr><td className="area">Lawful basis</td><td>Health is &quot;sensitive personal data&quot;; it needs a specific condition to process (a medical purpose handled by a professional under a duty of confidence, or explicit consent).</td><td>Frames use around treatment, payment and operations.</td><td>Take explicit consent at intake and record the medical-purpose basis in writing.</td></tr>
              <tr><td className="area">Privacy notice</td><td>Tell people clearly and up front how their data is used.</td><td>Prescribes a full Notice of Privacy Practices with required sections.</td><td>A Cayman-grounded notice, written to HIPAA&apos;s level of completeness.</td></tr>
              <tr><td className="area">Patient rights</td><td>Access (answer within about 30 days), correction, objection, complaint to the Ombudsman, compensation.</td><td>Adds accounting of disclosures, restriction requests, confidential-communication choices.</td><td>Honour the Cayman rights; add HIPAA&apos;s disclosure log and restriction handling.</td></tr>
              <tr><td className="area">Security</td><td>&quot;Appropriate technical and organisational measures&quot;, deliberately open-ended.</td><td>A concrete safeguard checklist plus a formal risk analysis.</td><td>Use HIPAA&apos;s control list as our evidence that the Cayman standard is met.</td></tr>
              <tr><td className="area">Vendors</td><td>Our duty of care extends to the processors we rely on.</td><td>A signed Business Associate Agreement with everyone who handles patient data.</td><td>Signed data agreements with host, database, email and Zoom.</td></tr>
              <tr><td className="area">Breach response</td><td>Notify the Ombudsman and affected people without undue delay.<span className="hpx-led">Cayman-led</span></td><td>Notify individuals, keep a full record, escalate large breaches.</td><td>One plan on the Cayman clock, documented to HIPAA&apos;s depth.</td></tr>
              <tr><td className="area">Data overseas</td><td>Data may leave Cayman only with adequate protection or a valid condition.<span className="hpx-led">Cayman-led</span></td><td>No equivalent (HIPAA is US-domestic).</td><td>Document a basis for our US hosting (contracts plus consent).</td></tr>
              <tr><td className="area">Mental-health notes</td><td>Sensitive data plus the confidentiality duty.</td><td>Psychotherapy notes kept separate, with a higher bar to disclose.</td><td>Keep process notes separate from the record and extra-restricted.</td></tr>
              <tr><td className="area">Retention</td><td>Keep data no longer than necessary.</td><td>Written retention schedules.</td><td>A schedule that meets Cayman medical-record norms.</td></tr>
            </tbody>
          </table>
        </div>

        <p className="hpx-p" style={{ fontSize: 13, color: "var(--muted,#6b7679)", marginTop: 14, marginBottom: 0 }}>Internal planning summary, not legal advice. Because the practice is in the Cayman Islands, a Cayman-qualified attorney should confirm what applies and approve the final program.</p>
      </section>

      <section className="hp-sec">
        <h2 className="hp-sech">Already in place</h2>
        <p className="hp-secsub">Safeguards the app already provides, plus anything you&apos;ve ticked off below.</p>
        <ul className="hp-safe">
          {safeguards.map((s) => (
            <li key={s.title}>
              <span className="hp-safe-ic" aria-hidden="true">✓</span>
              <div>
                <div className="hp-safe-t">{s.title}</div>
                <div className="hp-safe-d">{s.detail}</div>
              </div>
            </li>
          ))}
          {/* Tasks ticked off move up here in the exact same safeguard format. */}
          {doneTasks.map((t) => (
            <li key={t.id}>
              <span className="hp-safe-ic" aria-hidden="true">✓</span>
              <div>
                <div className="hp-safe-t">{t.title}</div>
                <div className="hp-safe-d">{t.detail}</div>
                <button
                  type="button"
                  onClick={() => changeStatus(t.id, "todo")}
                  style={{ marginTop: 8, background: "none", border: 0, padding: 0, font: "inherit", fontSize: 12.5, fontWeight: 600, color: "var(--muted,#6b7679)", textDecoration: "underline", cursor: "pointer" }}
                >
                  Move back to Still to do
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="hp-sec">
        <h2 className="hp-sech">Still to do</h2>
        <p className="hp-secsub">The steps left to be fully compliant. Set a status or add a progress note as you go.</p>
      </section>

      <ol className="hp-list">
        {pending.length > 0
          ? pending.map(renderTask)
          : <li className="hp-task"><p className="hp-detail" style={{ margin: 0 }}>🎉 Everything on this checklist is done. Great work.</p></li>}
      </ol>

      <p className="hp-foot">This board tracks the compliance project — it isn&apos;t legal advice or an official certification. A qualified HIPAA professional should confirm what applies and review the final setup. Because the practice is in the Cayman Islands, the Cayman Islands Data Protection Act (2021) also applies.</p>
    </div>
  );
}
