"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Ticket {
  id: string; ref: number; subject: string; area: string; body: string; status: string;
  createdAt: string; raisedBy: string; assignees: { id: string; name: string }[];
}
interface Reply { id: string; body: string; at: string; who: string; mine: boolean }
interface Contact { id: string; name: string; label: string }

const STATUS: Record<string, string> = { open: "Not started", in_progress: "Being sorted", resolved: "Done" };
const nameList = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "nobody") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
const stamp = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/comms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
}

export default function TicketDetail({ ticket, replies, threadId, canManage, contacts, images = [] }: {
  ticket: Ticket; replies: Reply[]; threadId: string; canManage: boolean; contacts: Contact[]; images?: string[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ids = ticket.assignees.map((a) => a.id);

  async function reply(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setError("");
    try { await post({ action: "send", threadId, body }); setText(""); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setBusy(false); }
  }

  const set = async (patch: Record<string, unknown>) => {
    setError("");
    try { await post({ action: "ticket:update", id: ticket.id, ...patch }); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
  };

  return (
    <>
      <Link href="/team/tickets" className="tm-back">← All tickets</Link>

      <div className="tm-head">
        <div>
          <h1 className="tm-h1"><span className="tm-ref">#{ticket.ref}</span>{ticket.subject}</h1>
          <p className="tm-sub">
            <span className="tm-area">{ticket.area}</span> raised by {ticket.raisedBy} · {stamp(ticket.createdAt)}
            <br />for {nameList(ticket.assignees.map((a) => a.name))}
          </p>
        </div>
        <span className={`tm-status ${ticket.status}`}>{STATUS[ticket.status]}</span>
      </div>

      {canManage && (
        <div className="tm-card tm-manage">
          <label className="tm-l" htmlFor="st">Status</label>
          <select id="st" className="tm-in" value={ticket.status} onChange={(e) => set({ status: e.target.value })}>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
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
            <p className="tm-nb">{r.body}</p>
          </div>
        ))}
      </div>

      {error && <p className="tm-err">{error}</p>}
      <form className="tm-card tm-form" onSubmit={reply}>
        <label className="tm-l" htmlFor="rp">Reply</label>
        <textarea id="rp" className="tm-in" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an update..." />
        <div className="tm-actions">
          {canManage && ticket.status !== "resolved" && (
            <button type="button" className="tm-ghost" onClick={() => set({ status: "resolved" })}>Mark done</button>
          )}
          {canManage && ticket.status === "resolved" && (
            <button type="button" className="tm-ghost" onClick={() => set({ status: "open" })}>Reopen</button>
          )}
          <button className="tm-cta" type="submit" disabled={busy || !text.trim()}>{busy ? "Sending..." : "Reply"}</button>
        </div>
      </form>
    </>
  );
}
