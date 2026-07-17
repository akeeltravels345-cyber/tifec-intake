"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface N { id: string; title: string; body: string; eventAt: string | null; pinned: boolean; createdAt: string; author: string }

const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const meetingWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/comms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
}

export default function NoticeBoard({ notices, canPost }: { notices: N[]; canPost: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [eventAt, setEventAt] = useState("");
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      await post({ action: "notice:create", title, body, eventAt, pinned });
      setTitle(""); setBody(""); setEventAt(""); setPinned(false); setOpen(false);
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    try { await post({ action: "notice:delete", id }); router.refresh(); } catch { /* shown on next load */ }
  }

  return (
    <>
      <div className="tm-head">
        <div>
          <h1 className="tm-h1">Notice board</h1>
          <p className="tm-sub">Announcements for everyone at TIFEC.</p>
        </div>
        {canPost && <button className="tm-cta" onClick={() => setOpen(!open)}>{open ? "Cancel" : "Post a notice"}</button>}
      </div>

      {canPost && open && (
        <form className="tm-card tm-form" onSubmit={submit}>
          <label className="tm-l" htmlFor="nt">Title</label>
          <input id="nt" className="tm-in" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Staff meeting on Thursday" />

          <label className="tm-l" htmlFor="nb">Notice</label>
          <textarea id="nb" className="tm-in" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What does everyone need to know?" />

          <div className="tm-row">
            <div style={{ flex: 1 }}>
              <label className="tm-l" htmlFor="ne">Meeting date &amp; time <span className="tm-opt">optional</span></label>
              <input id="ne" className="tm-in" type="datetime-local" value={eventAt} onChange={(e) => setEventAt(e.target.value)} />
            </div>
            <label className="tm-check">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              Pin to the top
            </label>
          </div>

          {error && <p className="tm-err">{error}</p>}
          <div className="tm-actions">
            <button className="tm-cta" type="submit" disabled={busy || !title.trim() || !body.trim()}>{busy ? "Posting..." : "Post notice"}</button>
          </div>
        </form>
      )}

      {notices.length === 0 ? (
        <div className="tm-card tm-empty">
          <div className="big">Nothing on the board</div>
          <div className="small">{canPost ? "Post the first notice and everyone will see it here." : "Notices from the practice will appear here."}</div>
        </div>
      ) : (
        <div className="tm-notices">
          {notices.map((n) => (
            <article key={n.id} className={`tm-card tm-notice ${n.pinned ? "pin" : ""}`}>
              <div className="tm-nhead">
                <h2 className="tm-nt">{n.pinned && <span className="tm-pin">Pinned</span>}{n.title}</h2>
                {canPost && <button className="tm-del" onClick={() => remove(n.id)}>Remove</button>}
              </div>
              {n.eventAt && <div className="tm-meet">📅 {meetingWhen(n.eventAt)}</div>}
              <p className="tm-nb">{n.body}</p>
              <div className="tm-nfoot">{n.author} · {when(n.createdAt)}</div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
