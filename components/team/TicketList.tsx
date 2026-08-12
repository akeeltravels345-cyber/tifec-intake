"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TICKET_STATUS_LABEL } from "@/lib/ticketStatus";

interface T {
  id: string; ref: number; subject: string; area: string; status: string;
  createdAt: string; updatedAt: string; raisedBy: string; assignees: string[]; mine: boolean; needsYou: boolean;
  waitingOn: string[]; enteredByName?: string | null;
}
interface Contact { id: string; name: string; label: string }

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
/** "Nick", "Nick and Akeel", "Shion, Nick and Akeel" */
const nameList = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "nobody") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

interface AttDraft { name: string; mime: string; base64: string; url: string; kind: "image" | "file" }
const FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,application/pdf";
const fileIcon = (name?: string | null) => {
  const ext = (name || "").split(".").pop()?.toLowerCase();
  return ext === "pdf" ? "📄" : ext === "csv" || ext === "xls" || ext === "xlsx" ? "📊" : ext === "doc" || ext === "docx" ? "📝" : "📎";
};
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function TicketList({ tickets, contacts, areas, seesAll, meId, meName }: {
  tickets: T[]; contacts: Contact[]; areas: string[]; seesAll: boolean; meId: string; meName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"open" | "done">("open");
  const [assignees, setAssignees] = useState<string[]>(contacts[0] ? [contacts[0].id] : []);
  // Who the issue is from. Defaults to you; the admin/owner can log it for someone
  // who called or messaged them, so the ticket sits with that person.
  const [reportedBy, setReportedBy] = useState(meId);
  const toggle = (id: string) =>
    setAssignees((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const [area, setArea] = useState(areas[0] ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [atts, setAtts] = useState<AttDraft[]>([]);

  async function addFiles(list: FileList | null, asImage: boolean) {
    if (!list) return;
    setError("");
    for (const f of Array.from(list)) {
      if (asImage && !f.type.startsWith("image/")) { setError(`"${f.name}" isn't an image.`); continue; }
      if (f.size > 4 * 1024 * 1024) { setError(`"${f.name}" is over 4 MB.`); continue; }
      const base64 = await fileToBase64(f);
      setAtts((a) => [...a, { name: f.name, mime: f.type || "application/octet-stream", base64, url: URL.createObjectURL(f), kind: f.type.startsWith("image/") ? "image" : "file" }]);
    }
  }
  const removeAtt = (i: number) => setAtts((a) => a.filter((_, idx) => idx !== i));

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
        body: JSON.stringify({ action: "ticket:create", assignees, area, subject, body, reportedBy, attachments: atts.map((a) => ({ base64: a.base64, mime: a.mime, name: a.name })) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      setSubject(""); setBody(""); setAtts([]); setReportedBy(meId); setOpen(false);
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
          {seesAll && (
            <>
              <label className="tm-l" htmlFor="trep">Who&apos;s this from? <span className="tm-opt">logging it for someone who contacted you?</span></label>
              <select id="trep" className="tm-in" value={reportedBy} onChange={(e) => setReportedBy(e.target.value)}>
                <option value={meId}>Me ({meName})</option>
                {contacts.filter((c) => c.id !== meId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {reportedBy !== meId && <p className="tm-hint">This goes on record as raised by <b>{contacts.find((c) => c.id === reportedBy)?.name}</b>. They&apos;ll be notified and get the updates.</p>}
            </>
          )}
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

          <label className="tm-l">Attachments <span className="tm-opt">optional — screenshots or files (PDF, docs) up to 4 MB each</span></label>
          <div className="tm-attbar">
            <label className="tm-imgbtn">🖼 Add image
              <input type="file" accept="image/*" multiple onChange={(e) => { addFiles(e.target.files, true); e.currentTarget.value = ""; }} style={{ display: "none" }} />
            </label>
            <label className="tm-imgbtn">📎 Add file
              <input type="file" accept={FILE_ACCEPT} multiple onChange={(e) => { addFiles(e.target.files, false); e.currentTarget.value = ""; }} style={{ display: "none" }} />
            </label>
          </div>
          {atts.length > 0 && (
            <div className="tm-imgdrafts">
              {atts.map((a, i) => (
                <span key={i} className={`tm-imgdraft ${a.kind}`}>
                  {a.kind === "image" ? <img src={a.url} alt={a.name} /> : <span className="tm-filechip">{fileIcon(a.name)} {a.name}</span>}
                  <button type="button" onClick={() => removeAtt(i)} aria-label="Remove">×</button>
                </span>
              ))}
            </div>
          )}

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
                  {t.enteredByName && <> · logged by {t.enteredByName}</>}
                  · {when(t.createdAt)}
                </div>
              </div>
              <div className="tm-tright">
                {t.status !== "resolved" && (
                  t.needsYou
                    ? <span className="tm-ball you">Your turn</span>
                    : t.waitingOn.length > 0 && <span className="tm-ball">Waiting on {nameList(t.waitingOn)}</span>
                )}
                <span className={`tm-status ${t.status}`}>{TICKET_STATUS_LABEL[t.status as keyof typeof TICKET_STATUS_LABEL]}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
