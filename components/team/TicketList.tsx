"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface T {
  id: string; ref: number; subject: string; area: string; status: string;
  createdAt: string; updatedAt: string; raisedBy: string; assignee: string; mine: boolean;
}
interface Contact { id: string; name: string; label: string }

const STATUS: Record<string, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved" };
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function TicketList({ tickets, contacts, areas, seesAll }: {
  tickets: T[]; contacts: Contact[]; areas: string[]; seesAll: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"live" | "all">("live");
  const [assignee, setAssignee] = useState(contacts[0]?.id ?? "");
  const [area, setArea] = useState(areas[0] ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const shown = tickets.filter((t) => (filter === "all" ? true : t.status !== "resolved"));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/comms", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ticket:create", assignee, area, subject, body }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      setSubject(""); setBody(""); setOpen(false);
      router.refresh();
      router.push(`/team/tickets/${j.id}`);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="tm-head">
        <div>
          <h1 className="tm-h1">Tickets</h1>
          <p className="tm-sub">{seesAll ? "Everything raised across the practice." : "Issues you've raised, and anything assigned to you."}</p>
        </div>
        <button className="tm-cta" onClick={() => setOpen(!open)}>{open ? "Cancel" : "Raise a ticket"}</button>
      </div>

      {open && (
        <form className="tm-card tm-form" onSubmit={submit}>
          <div className="tm-row">
            <div style={{ flex: 1 }}>
              <label className="tm-l" htmlFor="ta">Who's this for?</label>
              <select id="ta" className="tm-in" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.label} · {c.name}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="tm-l" htmlFor="tar">Subject area</label>
              <select id="tar" className="tm-in" value={area} onChange={(e) => setArea(e.target.value)}>
                {areas.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          <label className="tm-l" htmlFor="ts">Subject</label>
          <input id="ts" className="tm-in" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary of the issue" />

          <label className="tm-l" htmlFor="tb">What's going on?</label>
          <textarea id="tb" className="tm-in" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Give enough detail to act on it." />
          <p className="tm-hint">Please don&apos;t include client names or clinical detail.</p>

          {error && <p className="tm-err">{error}</p>}
          <div className="tm-actions">
            <button className="tm-cta" type="submit" disabled={busy || !subject.trim() || !body.trim()}>{busy ? "Sending..." : "Raise ticket"}</button>
          </div>
        </form>
      )}

      <div className="tm-tabs2">
        <button className={`tm-tab2 ${filter === "live" ? "on" : ""}`} onClick={() => setFilter("live")}>Open ({tickets.filter((t) => t.status !== "resolved").length})</button>
        <button className={`tm-tab2 ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>All ({tickets.length})</button>
      </div>

      {shown.length === 0 ? (
        <div className="tm-card tm-empty">
          <div className="big">{filter === "live" ? "Nothing open" : "No tickets yet"}</div>
          <div className="small">Raise one and it goes straight to whoever can sort it.</div>
        </div>
      ) : (
        <div className="tm-tickets">
          {shown.map((t) => (
            <Link key={t.id} href={`/team/tickets/${t.id}`} className="tm-card tm-ticket">
              <div className="tm-tleft">
                <div className="tm-tsub"><span className="tm-ref">#{t.ref}</span>{t.subject}</div>
                <div className="tm-tmeta">
                  <span className="tm-area">{t.area}</span>
                  {t.mine ? <>for <b>{t.assignee}</b></> : <>from <b>{t.raisedBy}</b></>}
                  · {when(t.createdAt)}
                </div>
              </div>
              <span className={`tm-status ${t.status}`}>{STATUS[t.status]}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
