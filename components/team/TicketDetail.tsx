"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TICKET_STATUS_LABEL, statusActions, type TicketStatus } from "@/lib/ticketStatus";
import { prepareUpload } from "@/lib/imageUpload";
import { formatText } from "@/lib/richText";
import RichTextArea from "./RichTextArea";
import { IcoImage, IcoFile, IcoMic, IcoStop } from "./attachIcons";

interface Att { docId: string; kind: "image" | "audio" | "file"; name?: string | null }
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
interface Draft { id: string; kind: "image" | "audio" | "file"; mime: string; base64: string; url: string; name?: string }
const MAX_BYTES = 4 * 1024 * 1024;
// Document types allowed alongside images/voice notes.
const FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,application/pdf";
const fileIcon = (name?: string | null) => {
  const ext = (name || "").split(".").pop()?.toLowerCase();
  return ext === "pdf" ? "📄" : ext === "csv" || ext === "xls" || ext === "xlsx" ? "📊" : ext === "doc" || ext === "docx" ? "📝" : "📎";
};

// Render one saved attachment: image inline, voice note as a player, any other
// file as an open/download link with its filename.
function AttView({ a }: { a: Att }) {
  const src = `/api/comms/ticket-image/${a.docId}`;
  if (a.kind === "audio") return <audio controls preload="none" className="tm-audio" src={src} />;
  if (a.kind === "file") return (
    <a href={src} target="_blank" rel="noreferrer" className="tm-file"><span className="ic">{fileIcon(a.name)}</span><span className="nm">{a.name || "Attachment"}</span></a>
  );
  return (
    <a href={src} target="_blank" rel="noreferrer" className="tm-imgwrap"><img src={src} alt={a.name || "Attachment"} className="tm-img" /></a>
  );
}
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
const rid = () => Math.random().toString(36).slice(2);

export default function TicketDetail({ ticket, replies, threadId, canManage, canDelete = false, contacts, firstAttachments = [], waitingOn = [], yourTurn = false }: {
  ticket: Ticket; replies: Reply[]; threadId: string; canManage: boolean; canDelete?: boolean; contacts: Contact[];
  firstAttachments?: Att[]; waitingOn?: string[]; yourTurn?: boolean;
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

  async function addFiles(list: FileList | null, asImage: boolean) {
    if (!list) return;
    setError("");
    for (const f of Array.from(list)) {
      if (asImage && !f.type.startsWith("image/")) { setError(`"${f.name}" isn't an image.`); continue; }
      // Non-images are capped up front; images get downscaled first, then checked.
      if (!f.type.startsWith("image/") && f.size > MAX_BYTES) { setError(`"${f.name}" is over 4 MB.`); continue; }
      const prepped = await prepareUpload(f);
      const size = Math.floor((prepped.base64.length * 3) / 4);
      if (!prepped.base64) { setError(`Couldn't read "${f.name}".`); continue; }
      if (size > MAX_BYTES) { setError(`"${f.name}" is too large even after shrinking — try a smaller image.`); continue; }
      const kind = prepped.mime.startsWith("image/") ? "image" : prepped.mime.startsWith("audio/") ? "audio" : "file";
      setDrafts((d) => [...d, { id: rid(), kind, mime: prepped.mime, base64: prepped.base64, url: `data:${prepped.mime};base64,${prepped.base64}`, name: prepped.name }]);
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
      await post({ action: "send", threadId, body, attachments: drafts.map((d) => ({ base64: d.base64, mime: d.mime, name: d.name })) });
      setText(""); setDrafts([]); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setBusy(false); }
  }

  const set = async (patch: Record<string, unknown>) => {
    setError("");
    try { await post({ action: "ticket:update", id: ticket.id, ...patch }); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
  };

  async function del() {
    if (!window.confirm(`Delete ticket #${ticket.ref} for good? This removes it, its whole thread and any attachments for everyone. This cannot be undone.`)) return;
    setBusy(true); setError("");
    try { await post({ action: "ticket:delete", id: ticket.id }); router.push("/team/tickets"); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed"); setBusy(false); }
  }

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
          {canDelete && (
            <div className="tm-managefoot">
              <button type="button" className="tm-del" onClick={del} disabled={busy}>Delete ticket</button>
            </div>
          )}
        </div>
      )}

      <div className="tm-card tm-first">
        <div className="tm-rwho">{ticket.raisedBy}</div>
        <p className="tm-nb" dangerouslySetInnerHTML={{ __html: formatText(ticket.body) }} />
        {firstAttachments.length > 0 && (
          <div className="tm-atts">
            {firstAttachments.map((a) => <AttView key={a.docId} a={a} />)}
          </div>
        )}
      </div>

      <div className="tm-replies">
        {replies.map((r) => (
          <div key={r.id} className={`tm-card tm-reply ${r.mine ? "me" : ""}`}>
            <div className="tm-rwho">{r.who} <span className="tm-rwhen">{stamp(r.at)}</span></div>
            {r.body && <p className="tm-nb" dangerouslySetInnerHTML={{ __html: formatText(r.body) }} />}
            {r.attachments.length > 0 && (
              <div className="tm-atts">
                {r.attachments.map((a) => <AttView key={a.docId} a={a} />)}
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <p className="tm-err">{error}</p>}
      <form className="tm-card tm-form" onSubmit={reply}>
        <label className="tm-l" htmlFor="rp">Reply</label>
        <RichTextArea id="rp" rows={3} value={text} onChange={setText} placeholder="Add an update, attach a screenshot, or record a voice note..." />

        {drafts.length > 0 && (
          <div className="tm-drafts">
            {drafts.map((d) => (
              <span key={d.id} className={`tm-draft ${d.kind}`}>
                {d.kind === "image"
                  ? <img src={d.url} alt={d.name || "image"} />
                  : d.kind === "audio"
                    ? <audio controls preload="metadata" src={d.url} />
                    : <span className="tm-filechip">{fileIcon(d.name)} {d.name}</span>}
                <button type="button" onClick={() => removeDraft(d.id)} aria-label="Remove">×</button>
              </span>
            ))}
          </div>
        )}

        <div className="tm-formfoot">
          <div className="tm-formtools">
            <label className="tm-icobtn" title="Add photo">
              {IcoImage}
              <input type="file" accept="image/*" multiple onChange={(e) => { addFiles(e.target.files, true); e.currentTarget.value = ""; }} style={{ display: "none" }} />
            </label>
            <label className="tm-icobtn" title="Attach file">
              {IcoFile}
              <input type="file" accept={FILE_ACCEPT} multiple onChange={(e) => { addFiles(e.target.files, false); e.currentTarget.value = ""; }} style={{ display: "none" }} />
            </label>
            <button type="button" className={`tm-icobtn ${recording ? "rec" : ""}`} title={recording ? "Stop recording" : "Record voice note"} onClick={recording ? stopRec : startRec}>
              {recording ? IcoStop : IcoMic}
            </button>
            {recording && <span className="tm-rectime">{mmss(recSecs)}</span>}
          </div>
          <button className="tm-cta" type="submit" disabled={busy || recording || (!text.trim() && drafts.length === 0)}>{busy ? "Sending..." : "Reply"}</button>
        </div>
      </form>
    </>
  );
}
