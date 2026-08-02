"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Ack { name: string; response: string }
interface N { id: string; title: string; body: string; eventAt: string | null; pinned: boolean; createdAt: string; authorId: string; author: string; askAck: boolean; acks: Ack[]; iAcked: boolean }

const initials = (name: string) => {
  const p = name.replace(/\(.*?\)/g, "").split(/\s+/).filter((w) => w && !/^(dr|mrs|mr|ms|miss)\.?$/i.test(w));
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
};
/** Live "in 2d 3h" / "in 14m" / "happening now" for a meeting time. */
function countdown(iso: string, now: number): string {
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return diff > -3600000 ? "happening now" : "just passed";
  const mins = Math.floor(diff / 60000);
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

/** ISO timestamp → the value a <input type="datetime-local"> expects. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const meetingWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/comms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
}

export default function NoticeBoard({ notices, canPost, meId = "", isAdmin = false }: { notices: N[]; canPost: boolean; meId?: string; isAdmin?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [eventAt, setEventAt] = useState("");
  const [pinned, setPinned] = useState(false);
  const [askAck, setAskAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "nod" | "meet">("all");
  // Live clock for meeting countdowns (client-only, so no hydration mismatch).
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  // Inline edit of an existing notice.
  const [editId, setEditId] = useState<string | null>(null);
  const [eTitle, setETitle] = useState("");
  const [eBody, setEBody] = useState("");
  const [eEventAt, setEEventAt] = useState("");
  const [ePinned, setEPinned] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  // Only the person who posted a notice, or an admin, may change it.
  const canManage = (n: N) => n.authorId === meId || isAdmin;

  function startEdit(n: N) {
    setEditId(n.id); setETitle(n.title); setEBody(n.body); setEEventAt(toLocalInput(n.eventAt)); setEPinned(n.pinned); setError("");
  }
  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !editId) return;
    setBusy(true); setError("");
    try {
      await post({ action: "notice:edit", id: editId, title: eTitle, body: eBody, eventAt: eEventAt, pinned: ePinned });
      setEditId(null); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setBusy(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      await post({ action: "notice:create", title, body, eventAt, pinned, askAck });
      setTitle(""); setBody(""); setEventAt(""); setPinned(false); setAskAck(false); setOpen(false);
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setBusy(false); }
  }

  async function ack(id: string, response: string) {
    try { await post({ action: "notice:ack", id, response }); router.refresh(); } catch { /* shown on next load */ }
  }
  const filtered = notices.filter((n) => (filter === "nod" ? n.askAck && !n.iAcked : filter === "meet" ? !!n.eventAt : true));
  const nodCount = notices.filter((n) => n.askAck && !n.iAcked).length;

  async function remove(id: string) {
    try { await post({ action: "notice:delete", id }); router.refresh(); } catch { /* shown on next load */ }
  }

  return (
    <>
      <div className="tm-head">
        <div>
          <h1 className="tm-h1">Notice board</h1>
          <p className="tm-sub">Announcements for everyone at TIFEC.{isAdmin && <> · <Link href="/team/email-log" className="tm-editlink">Email delivery</Link></>}</p>
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
            <label className="tm-check">
              <input type="checkbox" checked={askAck} onChange={(e) => setAskAck(e.target.checked)} />
              Ask everyone to acknowledge
            </label>
          </div>

          {error && <p className="tm-err">{error}</p>}
          <div className="tm-actions">
            <button className="tm-cta" type="submit" disabled={busy || !title.trim() || !body.trim()}>{busy ? "Posting..." : "Post notice"}</button>
          </div>
        </form>
      )}

      <div className="tm-tabs2">
        <button className={`tm-tab2 ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>All ({notices.length})</button>
        <button className={`tm-tab2 ${filter === "nod" ? "on" : ""}`} onClick={() => setFilter("nod")}>Needs your nod ({nodCount})</button>
        <button className={`tm-tab2 ${filter === "meet" ? "on" : ""}`} onClick={() => setFilter("meet")}>Meetings ({notices.filter((n) => n.eventAt).length})</button>
      </div>

      {filtered.length === 0 ? (
        <div className="tm-card tm-empty">
          <div className="big">{filter === "nod" ? "Nothing needs your nod" : filter === "meet" ? "No meetings scheduled" : "Nothing on the board"}</div>
          <div className="small">{canPost ? "Post the first notice and everyone will see it here." : "Notices from the practice will appear here."}</div>
        </div>
      ) : (
        <div className="tm-notices">
          {filtered.map((n) => editId === n.id ? (
            <form key={n.id} className="tm-card tm-form" onSubmit={saveEdit}>
              <label className="tm-l">Title</label>
              <input className="tm-in" value={eTitle} onChange={(e) => setETitle(e.target.value)} />
              <label className="tm-l">Notice</label>
              <textarea className="tm-in" rows={4} value={eBody} onChange={(e) => setEBody(e.target.value)} />
              <div className="tm-row">
                <div style={{ flex: 1 }}>
                  <label className="tm-l">Meeting date &amp; time <span className="tm-opt">optional</span></label>
                  <input className="tm-in" type="datetime-local" value={eEventAt} onChange={(e) => setEEventAt(e.target.value)} />
                </div>
                <label className="tm-check"><input type="checkbox" checked={ePinned} onChange={(e) => setEPinned(e.target.checked)} /> Pin</label>
              </div>
              {error && <p className="tm-err">{error}</p>}
              <div className="tm-actions">
                <button className="tm-cta" type="submit" disabled={busy || !eTitle.trim() || !eBody.trim()}>{busy ? "Saving…" : "Save changes"}</button>
                <button className="tm-ghost" type="button" onClick={() => { setEditId(null); setError(""); }}>Cancel</button>
              </div>
            </form>
          ) : (
            <article key={n.id} className={`tm-card tm-notice ${n.pinned ? "pin" : ""}`}>
              <div className="tm-nhead">
                <h2 className="tm-nt">{n.pinned && <span className="tm-pin">Pinned</span>}{n.title}</h2>
                {canManage(n) && (
                  <div className="tm-nactions">
                    {confirmDel === n.id ? (
                      <>
                        <span className="tm-delq">Delete?</span>
                        <button className="tm-del" onClick={() => remove(n.id)}>Yes</button>
                        <button className="tm-ghost" onClick={() => setConfirmDel(null)}>No</button>
                      </>
                    ) : (
                      <>
                        <button className="tm-editlink" onClick={() => startEdit(n)}>Edit</button>
                        <button className="tm-del" onClick={() => setConfirmDel(n.id)}>Remove</button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {n.eventAt && <div className="tm-meet">📅 {meetingWhen(n.eventAt)}{now > 0 && <span className="tm-countdown"> · {countdown(n.eventAt, now)}</span>}</div>}
              <p className="tm-nb">{n.body}</p>
              <div className="tm-nfoot">{n.author} · {when(n.createdAt)}</div>
              {n.askAck && (
                <div className="tm-ackrow">
                  <div className="tm-acks">
                    {n.acks.slice(0, 6).map((a, i) => <span key={i} className="tm-ackav" title={`${a.name}: ${a.response}`}>{initials(a.name)}</span>)}
                    <span className="tm-ackcount">{n.acks.length === 0 ? "No one yet" : `${n.acks.length} confirmed`}</span>
                  </div>
                  {n.iAcked
                    ? <span className="tm-acked">✓ You&apos;re in</span>
                    : <button className="tm-cta sm" type="button" onClick={() => ack(n.id, n.eventAt ? "I'll be there" : "Got it")}>{n.eventAt ? "I'll be there" : "Got it"}</button>}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
