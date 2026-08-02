"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface T {
  id: string; ref: number; subject: string; area: string; status: string;
  createdAt: string; updatedAt: string; raisedBy: string; assignees: string[]; mine: boolean; needsYou: boolean;
}
interface Contact { id: string; name: string; label: string }

// Plainer words than the raw statuses (legibility pass).
const STATUS: Record<string, string> = { open: "Not started", in_progress: "Being sorted", resolved: "Done" };
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
/** "Nick", "Nick and Akeel", "Shion, Nick and Akeel" */
const nameList = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "nobody") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

export default function TicketList({ tickets, contacts, areas, seesAll }: {
  tickets: T[]; contacts: Contact[]; areas: string[]; seesAll: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"open" | "done">("open");
  const [assignees, setAssignees] = useState<string[]>(contacts[0] ? [contacts[0].id] : []);
  const toggle = (id: string) =>
    setAssignees((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const [area, setArea] = useState(areas[0] ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const shown = tickets
    .filter((t) => (filter === "done" ? t.status === "resolved" : t.status !== "resolved"))
    // Tickets waiting on you rise to the top.
    .sort((a, b) => (a.needsYou === b.needsYou ? 0 : a.needsYou ? -1 : 1));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/comms", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ticket:create", assignees, area, subject, body }),
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
          <fieldset className="tm-fs">
            <legend className="tm-l">Who&apos;s this for? <span className="tm-opt">pick one or more</span></legend>
            <div className="tm-picks">
              {contacts.map((c) => (
                <label key={c.id} className={`tm-pick ${assignees.includes(c.id) ? "on" : ""}`}>
                  <input type="checkbox" checked={assignees.includes(c.id)} onChange={() => toggle(c.id)} />
                  <span>
                    <span className="tm-pickname">{c.name}</span>
                    <span className="tm-picklabel">{c.label}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="tm-l" htmlFor="tar">Subject area</label>
          <select id="tar" className="tm-in" value={area} onChange={(e) => setArea(e.target.value)}>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>

          <label className="tm-l" htmlFor="ts">Subject</label>
          <input id="ts" className="tm-in" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary of the issue" />

          <label className="tm-l" htmlFor="tb">What's going on?</label>
          <textarea id="tb" className="tm-in" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Give enough detail to act on it." />
          <p className="tm-hint">Please don&apos;t include client names or clinical detail.</p>

          {error && <p className="tm-err">{error}</p>}
          <div className="tm-actions">
            <button className="tm-cta" type="submit" disabled={busy || !subject.trim() || !body.trim() || assignees.length === 0}>{busy ? "Sending..." : "Raise ticket"}</button>
          </div>
        </form>
      )}

      <div className="tm-tabs2">
        <button className={`tm-tab2 ${filter === "open" ? "on" : ""}`} onClick={() => setFilter("open")}>Still open ({tickets.filter((t) => t.status !== "resolved").length})</button>
        <button className={`tm-tab2 ${filter === "done" ? "on" : ""}`} onClick={() => setFilter("done")}>Done ({tickets.filter((t) => t.status === "resolved").length})</button>
      </div>

      {shown.length === 0 ? (
        <div className="tm-card tm-empty">
          <div className="big">{filter === "done" ? "Nothing done yet" : "Nothing open"}</div>
          <div className="small">Raise one and it goes straight to whoever can sort it.</div>
        </div>
      ) : (
        <div className="tm-tickets">
          {shown.map((t) => (
            <Link key={t.id} href={`/team/tickets/${t.id}`} className={`tm-card tm-ticket${t.needsYou ? " needsyou" : ""}`}>
              <div className="tm-tleft">
                <div className="tm-tsub"><span className="tm-ref">#{t.ref}</span>{t.subject}</div>
                <div className="tm-tmeta">
                  <span className="tm-area">{t.area}</span>
                  {t.mine ? <>for <b>{nameList(t.assignees)}</b></> : <>from <b>{t.raisedBy}</b></>}
                  · {when(t.createdAt)}
                </div>
              </div>
              <div className="tm-tright">
                {t.needsYou && <span className="tm-needsyou">Needs you</span>}
                <span className={`tm-status ${t.status}`}>{STATUS[t.status]}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
