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

      <section className="hp-sec">
        <h2 className="hp-sech">Already in place</h2>
        <p className="hp-secsub">Safeguards the app already provides to protect health information.</p>
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
        </ul>
      </section>

      <section className="hp-sec">
        <h2 className="hp-sech">Still to do</h2>
        <p className="hp-secsub">The steps left to be fully compliant. Set a status or add a progress note as you go.</p>
      </section>

      <ol className="hp-list">
        {items.map((t) => (
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
        ))}
      </ol>

      <p className="hp-foot">This board tracks the compliance project — it isn&apos;t legal advice or an official certification. A qualified HIPAA professional should confirm what applies and review the final setup. Because the practice is in the Cayman Islands, the Cayman Islands Data Protection Act (2021) also applies.</p>
    </div>
  );
}
