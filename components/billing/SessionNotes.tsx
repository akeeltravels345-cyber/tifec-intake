"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface NoteRow {
  id: string;
  clinicianId: string;
  author: string;
  noteDate: string;
  soap: { s: string; o: string; a: string; p: string };
  updatedAt: string;
}

const FIELDS: { k: "s" | "o" | "a" | "p"; label: string; hint: string }[] = [
  { k: "s", label: "Subjective", hint: "What the client reports — how they say they're doing." },
  { k: "o", label: "Objective", hint: "What you observed — presentation, affect, measures." },
  { k: "a", label: "Assessment", hint: "Your clinical impression / progress toward goals." },
  { k: "p", label: "Plan", hint: "Next steps, interventions, homework, follow-up." },
];
const empty = { s: "", o: "", a: "", p: "" };

export default function SessionNotes({ clientId, notes, meId, today }: {
  clientId: string;
  notes: NoteRow[];
  meId: string;
  today: string;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [soap, setSoap] = useState({ ...empty });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function startAdd() { setEditId(null); setAdding(true); setDate(today); setSoap({ ...empty }); setErr(""); }
  function startEdit(n: NoteRow) { setAdding(false); setEditId(n.id); setDate(n.noteDate); setSoap({ ...n.soap }); setErr(""); }
  function cancel() { setAdding(false); setEditId(null); setSoap({ ...empty }); setErr(""); }

  async function save() {
    if (!soap.s.trim() && !soap.o.trim() && !soap.a.trim() && !soap.p.trim()) { setErr("Write something in the note first."); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/billing/clients/${clientId}/notes`, {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(editId ? { noteId: editId } : {}), noteDate: date, ...soap }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not save.");
      cancel();
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not save."); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/billing/clients/${clientId}/notes`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ noteId: id }) });
      if (!res.ok) throw new Error((await res.json()).error || "Could not delete.");
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not delete."); }
    finally { setBusy(false); }
  }

  const editor = (
    <div className="sn-editor">
      <label className="sn-datelab">Session date<input type="date" className="ls-in" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></label>
      {FIELDS.map((f) => (
        <label className="sn-field" key={f.k}>
          <span className="sn-flab">{f.label} <span className="opt">{f.hint}</span></span>
          <textarea className="ls-in" rows={3} value={soap[f.k]} onChange={(e) => setSoap((s) => ({ ...s, [f.k]: e.target.value }))} />
        </label>
      ))}
      {err && <div className="ls-err">{err}</div>}
      <div className="sn-acts">
        <button type="button" className="ls-save sm" disabled={busy} onClick={save}>{busy ? "Saving…" : editId ? "Save note" : "Add note"}</button>
        <button type="button" className="su-del sm" disabled={busy} onClick={cancel}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div className="sn-wrap">
      {!adding && !editId && (
        <button type="button" className="sn-add" onClick={startAdd}>+ New session note</button>
      )}
      {adding && editor}

      {notes.length === 0 && !adding ? (
        <p className="sn-empty">No session notes yet. Add the first one — it&apos;s encrypted and only visible to this client&apos;s clinicians.</p>
      ) : (
        <div className="sn-list">
          {notes.map((n) => editId === n.id ? (
            <div key={n.id}>{editor}</div>
          ) : (
            <div className="sn-note" key={n.id}>
              <div className="sn-head">
                <span className="sn-date">{n.noteDate}</span>
                <span className="sn-by">{n.author}</span>
                {n.clinicianId === meId && (
                  <span className="sn-noteacts">
                    <button type="button" className="sn-link" onClick={() => startEdit(n)}>Edit</button>
                    <button type="button" className="sn-link del" onClick={() => remove(n.id)}>Delete</button>
                  </span>
                )}
              </div>
              <div className="sn-body">
                {FIELDS.map((f) => n.soap[f.k].trim() ? (
                  <div className="sn-seg" key={f.k}><span className="sn-seglab">{f.label}</span><p>{n.soap[f.k]}</p></div>
                ) : null)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
