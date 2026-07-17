"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Ticket {
  id: string; ref: number; subject: string; area: string; body: string; status: string;
  createdAt: string; raisedBy: string; assignee: string; assigneeId: string;
}
interface Reply { id: string; body: string; at: string; who: string; mine: boolean }
interface Contact { id: string; name: string; label: string }

const STATUS: Record<string, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved" };
const stamp = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/comms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
}

export default function TicketDetail({ ticket, replies, threadId, canManage, contacts }: {
  ticket: Ticket; replies: Reply[]; threadId: string; canManage: boolean; contacts: Contact[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
          <label className="tm-l" htmlFor="as">Assigned to</label>
          <select id="as" className="tm-in" value={ticket.assigneeId} onChange={(e) => set({ assignee: e.target.value })}>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.label} · {c.name}</option>)}
          </select>
        </div>
      )}

      <div className="tm-card tm-first">
        <div className="tm-rwho">{ticket.raisedBy}</div>
        <p className="tm-nb">{ticket.body}</p>
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
            <button type="button" className="tm-ghost" onClick={() => set({ status: "resolved" })}>Mark resolved</button>
          )}
          <button className="tm-cta" type="submit" disabled={busy || !text.trim()}>{busy ? "Sending..." : "Reply"}</button>
        </div>
      </form>
    </>
  );
}
