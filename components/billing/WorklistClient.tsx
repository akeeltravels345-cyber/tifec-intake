"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Attach { docId: string; name: string; mime: string; kind: "file" | "voice" }

export interface FeatureRow {
  id: string;
  name: string;
  description: string;
  flow: string;
  priority: "nice" | "important" | "urgent";
  attachments: Attach[];
  by: string;
  at: string;
}

interface Draft { name: string; mime: string; kind: "file" | "voice"; base64: string }

const PRI_LABEL: Record<string, string> = { urgent: "Urgent", important: "Important", nice: "Nice to have" };
const ATT = (docId: string) => `/api/billing/worklist/attachment/${docId}`;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export default function WorklistClient({ rows }: { rows: FeatureRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [flowStart, setFlowStart] = useState("");
  const [flowEnd, setFlowEnd] = useState("");
  const [priority, setPriority] = useState("nice");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function onFiles(list: FileList | null) {
    if (!list) return;
    setError("");
    for (const f of Array.from(list)) {
      if (f.size > 4 * 1024 * 1024) { setError(`"${f.name}" is over 4 MB — too big to attach.`); continue; }
      const base64 = await blobToBase64(f);
      setDrafts((d) => [...d, { name: f.name, mime: f.type || "application/octet-stream", kind: "file", base64 }]);
    }
  }

  async function startRec() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        if (blob.size > 4 * 1024 * 1024) { setError("Voice note is too long (over 4 MB)."); setRecording(false); return; }
        const base64 = await blobToBase64(blob);
        setDrafts((d) => [...d, { name: "Voice note", mime: blob.type || "audio/webm", kind: "voice", base64 }]);
        setRecording(false);
      };
      recRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      setError("Couldn't access the microphone. Check your browser's mic permission.");
    }
  }
  function stopRec() { recRef.current?.stop(); }

  function removeDraft(i: number) { setDrafts((d) => d.filter((_, idx) => idx !== i)); }

  async function submit() {
    if (!name.trim()) { setError("Give the feature a name."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/billing/worklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, flowStart, flowEnd, priority, attachments: drafts }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not save.");
      setName(""); setDescription(""); setFlowStart(""); setFlowEnd(""); setPriority("nice"); setDrafts([]);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="su-topbar">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 className="su-h1">Worklist</h1>
            <p className="su-sub">Features you and Nick want built — name, what it does, the flow, plus screenshots or a voice note.</p>
          </div>
          <button type="button" className="wl-add" onClick={() => setOpen((o) => !o)}>{open ? "Close" : "+ Add a feature"}</button>
        </div>
      </div>

      {open && (
        <div className="wl-form">
          <label className="wl-lab">Feature name
            <input className="ls-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bulk mark self-pay balances paid" autoFocus />
          </label>
          <label className="wl-lab">What it does <span className="opt">plain words — what you want and why</span>
            <textarea className="ls-in" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the feature and how you'd use it…" />
          </label>
          <div className="wl-flow">
            <label className="wl-lab">Where it starts
              <input className="ls-in" value={flowStart} onChange={(e) => setFlowStart(e.target.value)} placeholder="e.g. Owed by clients → tick several" />
            </label>
            <span className="wl-arrow" aria-hidden="true">→</span>
            <label className="wl-lab">Where it ends
              <input className="ls-in" value={flowEnd} onChange={(e) => setFlowEnd(e.target.value)} placeholder="e.g. all marked paid on one date" />
            </label>
          </div>
          <label className="wl-lab">Priority
            <select className="ls-in" value={priority} onChange={(e) => setPriority(e.target.value)} style={{ maxWidth: 220 }}>
              <option value="nice">Nice to have</option>
              <option value="important">Important</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>

          <div className="wl-lab">Attachments <span className="opt">screenshots, files, or a voice note (max 4 MB each)</span>
            <div className="wl-attbar">
              <label className="wl-attbtn">📎 Attach file
                <input type="file" multiple onChange={(e) => { onFiles(e.target.files); e.currentTarget.value = ""; }} style={{ display: "none" }} />
              </label>
              {!recording
                ? <button type="button" className="wl-attbtn" onClick={startRec}>🎤 Record voice note</button>
                : <button type="button" className="wl-attbtn rec" onClick={stopRec}><span className="wl-recdot" /> Stop &amp; save</button>}
            </div>
            {drafts.length > 0 && (
              <div className="wl-drafts">
                {drafts.map((d, i) => (
                  <span className="wl-draft" key={i}>{d.kind === "voice" ? "🎤" : "📎"} {d.name}<button type="button" className="x" onClick={() => removeDraft(i)} aria-label="Remove">×</button></span>
                ))}
              </div>
            )}
          </div>

          {error && <div className="ls-err">{error}</div>}
          <div className="wl-acts">
            <button type="button" className="ls-save sm" disabled={busy || recording} onClick={submit}>{busy ? "Saving…" : "Add to worklist"}</button>
            <button type="button" className="su-del sm" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bq-empty" style={{ padding: 28 }}>
          <div className="big">No features yet</div>
          <div className="small">Add the first one — or send it to Nick to add what he needs.</div>
        </div>
      ) : (
        <div className="wl-list">
          {rows.map((f) => (
            <div className="wl-card" key={f.id}>
              <div className="wl-head">
                <span className="wl-name">{f.name}</span>
                <span className={`wl-pri ${f.priority}`}>{PRI_LABEL[f.priority]}</span>
              </div>
              {f.description && <p className="wl-desc">{f.description}</p>}
              {f.flow && <div className="wl-flowline"><span className="wl-flag">Flow</span>{f.flow}</div>}
              {f.attachments.length > 0 && (
                <div className="wl-atts">
                  {f.attachments.map((a) => a.kind === "voice" ? (
                    <audio key={a.docId} controls preload="none" src={ATT(a.docId)} className="wl-audio" />
                  ) : /^image\//.test(a.mime) ? (
                    <a key={a.docId} href={ATT(a.docId)} target="_blank" rel="noreferrer" className="wl-thumbwrap"><img src={ATT(a.docId)} alt={a.name} className="wl-thumb" /></a>
                  ) : (
                    <a key={a.docId} href={ATT(a.docId)} target="_blank" rel="noreferrer" className="wl-fileatt">📎 {a.name}</a>
                  ))}
                </div>
              )}
              <div className="wl-meta">Requested by {f.by} · {f.at}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
