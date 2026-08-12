"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TICKET_STATUS_LABEL, statusActions, type TicketStatus } from "@/lib/ticketStatus";

interface Att { docId: string; kind: "image" | "audio" }
interface Ticket {
  id: string; ref: number; subject: string; area: string; body: string; status: TicketStatus;
  createdAt: string; raisedBy: string; enteredBy?: string | null; assignees: { id: string; name: string }[];
}
interface Reply { id: string; body: string; at: string; who: string; mine: boolean; attachments: Att[] }
interface Contact { id: string; name: string; label: string }

const nameList = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "nobody") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
const stamp = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/comms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
}

// A pending attachment on the reply being typed (not yet sent).
interface Draft { id: string; kind: "image" | "audio"; mime: string; base64: string; url: string; name?: string }
const MAX_BYTES = 4 * 1024 * 1024;
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
const rid = () => Math.random().toString(36).slice(2);

export default function TicketDetail({ ticket, replies, threadId, canManage, contacts, images = [], waitingOn = [], yourTurn = false }: {
  ticket: Ticket; replies: Reply[]; threadId: string; canManage: boolean; contacts: Contact[];
  images?: string[]; waitingOn?: string[]; yourTurn?: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ids = ticket.assignees.map((a) => a.id);

  async function addImages(list: FileList | null) {
    if (!list) return;
    setError("");
    for (const f of Array.from(list)) {
      if (!f.type.startsWith("image/")) { setError(`"${f.name}" isn't an image.`); continue; }
      if (f.size > MAX_BYTES) { setError(`"${f.name}" is over 4 MB.`); continue; }
      const base64 = await blobToBase64(f);
      setDrafts((d) => [...d, { id: rid(), kind: "image", mime: f.type, base64, url: URL.createObjectURL(f), name: f.name }]);
    }
  }

  async function startRec() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) { setError("This browser can't record audio."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        stream.getTracks().forEach((t) => t.stop());
        const mime = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size > MAX_BYTES) { setError("That voice note is over 4 MB — keep it shorter."); return; }
        const base64 = await blobToBase64(blob);
        setDrafts((d) => [...d, { id: rid(), kind: "audio", mime, base64, url: URL.createObjectURL(blob) }]);
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
      setRecSecs(0);
      timerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch {
      setError("Couldn't reach the microphone. Allow mic access for this site and try again.");
    }
  }
  function stopRec() { recRef.current?.stop(); setRecording(false); }
  const removeDraft = (id: string) => setDrafts((d) => d.filter((x) => x.id !== id));

  async function reply(e: React.FormEvent) {
    e.preventDefault();
    if (busy || recording) return;
    const body = text.trim();
    if (!body && drafts.length === 0) return;
    setBusy(true); setError("");
    try {
      await post({ action: "send", threadId, body, attachments: drafts.map((d) => ({ base64: d.base64, mime: d.mime })) });
      setText(""); setDrafts([]); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setBusy(false); }
  }

  const set = async (patch: Record<string, unknown>) => {
    setError("");
    try { await post({ action: "ticket:update", id: ticket.id, ...patch }); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
  };

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <>
      <Link href="/team/tickets" className="tm-back">← All tickets</Link>

      <div className="tm-head">
        <div>
          <h1 className="tm-h1"><span className="tm-ref">#{ticket.ref}</span>{ticket.subject}</h1>
          <p className="tm-sub">
            <span className="tm-area">{ticket.area}</span> raised by {ticket.raisedBy}{ticket.enteredBy ? ` (logged by ${ticket.enteredBy})` : ""} · {stamp(ticket.createdAt)}
            <br />for {nameList(ticket.assignees.map((a) => a.name))}
          </p>
        </div>
        <span className={`tm-status ${ticket.status}`}>{TICKET_STATUS_LABEL[ticket.status]}</span>
      </div>

      {ticket.status !== "resolved" && (yourTurn || waitingOn.length > 0) && (
        <div className={`tm-ballbar ${yourTurn ? "you" : ""}`}>
          <span className="dot" />
          {yourTurn ? "Your turn — the ball is with you" : `Waiting on ${nameList(waitingOn)}`}
        </div>
      )}

      {canManage && (
        <div className="tm-card tm-manage">
          <span className="tm-l">Status</span>
          <div className="tm-statusrow">
            <span className={`tm-status ${ticket.status}`}>{TICKET_STATUS_LABEL[ticket.status]}</span>
            <div className="tm-sbtns">
              {statusActions(ticket.status).map((a) => (
                <button key={a.to} type="button" className={`tm-sbtn ${a.tone}`} onClick={() => set({ status: a.to })}>{a.label}</button>
              ))}
            </div>
          </div>
          <span className="tm-l">Assigned to</span>
          <div className="tm-picks">
            {contacts.map((c) => {
              const on = ids.includes(c.id);
              return (
                <label key={c.id} className={`tm-pick ${on ? "on" : ""}`}>
                  <input
                    type="checkbox" checked={on}
                    onChange={() => {
                      const next = on ? ids.filter((x) => x !== c.id) : [...ids, c.id];
                      // A ticket with nobody on it would just get lost.
                      if (next.length === 0) { setError("A ticket needs at least one person on it."); return; }
                      set({ assignees: next });
                    }}
                  />
                  <span>
                    <span className="tm-pickname">{c.name}</span>
                    <span className="tm-picklabel">{c.label}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="tm-card tm-first">
        <div className="tm-rwho">{ticket.raisedBy}</div>
        <p className="tm-nb">{ticket.body}</p>
        {images.length > 0 && (
          <div className="tm-imgs">
            {images.map((docId) => (
              <a key={docId} href={`/api/comms/ticket-image/${docId}`} target="_blank" rel="noreferrer" className="tm-imgwrap">
                <img src={`/api/comms/ticket-image/${docId}`} alt="Ticket attachment" className="tm-img" />
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="tm-replies">
        {replies.map((r) => (
          <div key={r.id} className={`tm-card tm-reply ${r.mine ? "me" : ""}`}>
            <div className="tm-rwho">{r.who} <span className="tm-rwhen">{stamp(r.at)}</span></div>
            {r.body && <p className="tm-nb">{r.body}</p>}
            {r.attachments.length > 0 && (
              <div className="tm-atts">
                {r.attachments.map((a) => a.kind === "audio" ? (
                  <audio key={a.docId} controls preload="none" className="tm-audio" src={`/api/comms/ticket-image/${a.docId}`} />
                ) : (
                  <a key={a.docId} href={`/api/comms/ticket-image/${a.docId}`} target="_blank" rel="noreferrer" className="tm-imgwrap">
                    <img src={`/api/comms/ticket-image/${a.docId}`} alt="Attachment" className="tm-img" />
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <p className="tm-err">{error}</p>}
      <form className="tm-card tm-form" onSubmit={reply}>
        <label className="tm-l" htmlFor="rp">Reply</label>
        <textarea id="rp" className="tm-in" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an update, attach a screenshot, or record a voice note..." />

        {drafts.length > 0 && (
          <div className="tm-drafts">
            {drafts.map((d) => (
              <span key={d.id} className={`tm-draft ${d.kind}`}>
                {d.kind === "image"
                  ? <img src={d.url} alt={d.name || "image"} />
                  : <audio controls preload="metadata" src={d.url} />}
                <button type="button" onClick={() => removeDraft(d.id)} aria-label="Remove">×</button>
              </span>
            ))}
          </div>
        )}

        <div className="tm-attbar">
          <label className="tm-attbtn">🖼 Image
            <input type="file" accept="image/*" multiple onChange={(e) => { addImages(e.target.files); e.currentTarget.value = ""; }} style={{ display: "none" }} />
          </label>
          {recording ? (
            <button type="button" className="tm-attbtn rec" onClick={stopRec}>⏹ Stop · {mmss(recSecs)}</button>
          ) : (
            <button type="button" className="tm-attbtn" onClick={startRec}>🎤 Voice note</button>
          )}
        </div>

        <div className="tm-actions">
          <button className="tm-cta" type="submit" disabled={busy || recording || (!text.trim() && drafts.length === 0)}>{busy ? "Sending..." : "Reply"}</button>
        </div>
      </form>
    </>
  );
}
