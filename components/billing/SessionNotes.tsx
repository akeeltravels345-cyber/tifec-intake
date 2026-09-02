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
  { k: "s", label: "Subjective", hint: "What the client reports: how they say they're doing." },
  { k: "o", label: "Objective", hint: "What you observed: presentation, affect, measures." },
  { k: "a", label: "Assessment", hint: "Your clinical impression / progress toward goals." },
  { k: "p", label: "Plan", hint: "Next steps, interventions, homework, follow-up." },
];
const empty = { s: "", o: "", a: "", p: "" };

// Where a clinician goes to write in Supanote. If your workspace lives at a
// different address, tell me and I'll change this one line.
const SUPANOTE_URL = "https://app.supanote.ai";

// Split a note pasted from Supanote into SOAP by its section headers. Supanote
// (and most templates) label the sections "Subjective/Objective/Assessment/Plan"
// we find those at line starts (allowing a leading #, *, - or > and a : . - )
// separator) and slice the text between them. Returns null when fewer than two
// sections are found, so an unstructured note is never mangled.
const SOAP_DEFS: { k: "s" | "o" | "a" | "p"; alts: string[] }[] = [
  { k: "s", alts: ["subjective", "s"] },
  { k: "o", alts: ["objective", "o"] },
  { k: "a", alts: ["assessment", "analysis", "impression", "a"] },
  { k: "p", alts: ["plan", "p"] },
];
function splitSoap(raw: string): { s: string; o: string; a: string; p: string } | null {
  const text = raw.replace(/\r/g, "");
  const hits: { k: "s" | "o" | "a" | "p"; start: number; end: number }[] = [];
  for (const d of SOAP_DEFS) {
    const re = new RegExp(`(?:^|\\n)[ \\t]*[#>*\\-]*[ \\t]*(?:${d.alts.join("|")})[ \\t]*[:.\\-–)]`, "i");
    const m = re.exec(text);
    if (m) hits.push({ k: d.k, start: m.index + (m[0][0] === "\n" ? 1 : 0), end: m.index + m[0].length });
  }
  if (hits.length < 2) return null;
  hits.sort((a, b) => a.start - b.start);
  const out = { s: "", o: "", a: "", p: "" };
  for (let i = 0; i < hits.length; i++) {
    out[hits[i].k] = text.slice(hits[i].end, i + 1 < hits.length ? hits[i + 1].start : undefined).trim();
  }
  return out;
}

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
  const [paste, setPaste] = useState("");
  const [pasteMsg, setPasteMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function startAdd() { setEditId(null); setAdding(true); setDate(today); setSoap({ ...empty }); setPaste(""); setPasteMsg(""); setErr(""); }
  function startEdit(n: NoteRow) { setAdding(false); setEditId(n.id); setDate(n.noteDate); setSoap({ ...n.soap }); setPaste(""); setPasteMsg(""); setErr(""); }
  function cancel() { setAdding(false); setEditId(null); setSoap({ ...empty }); setPaste(""); setPasteMsg(""); setErr(""); }

  // Take a note pasted from Supanote and lay it into the SOAP fields for review.
  // If it splits cleanly, fill the four fields; if not, drop it all into
  // Subjective so nothing is lost, and say so.
  function applyPaste(text: string) {
    if (!text.trim()) return;
    const parsed = splitSoap(text);
    if (parsed) {
      setSoap(parsed);
      setPasteMsg("Split into Subjective / Objective / Assessment / Plan. Check the fields below, then save.");
    } else {
      setSoap((s) => ({ ...s, s: [s.s, text.trim()].filter(Boolean).join("\n\n") }));
      setPasteMsg("Couldn't spot SOAP headings, so the whole note went into Subjective. Move any parts to the right box, then save.");
    }
    setPaste("");
  }

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
      <div className="sn-paste">
        <span className="sn-flab">Paste from Supanote <span className="opt">Write in Supanote, hit Copy, then paste here, and we&apos;ll split it into S/O/A/P below for you to review.</span></span>
        <textarea
          className="ls-in" rows={3} value={paste}
          placeholder="Paste a note copied from Supanote…"
          onChange={(e) => setPaste(e.target.value)}
          onPaste={(e) => { const t = e.clipboardData.getData("text"); if (t.trim()) { e.preventDefault(); applyPaste(t); } }}
        />
        <div className="sn-pasterow">
          {paste.trim() && <button type="button" className="sn-link" onClick={() => applyPaste(paste)}>Split into SOAP ↓</button>}
          {pasteMsg && <span className="sn-pastemsg">{pasteMsg}</span>}
        </div>
      </div>
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
      <div className="sn-toprow">
        {!adding && !editId && (
          <button type="button" className="sn-add" onClick={startAdd}>+ New session note</button>
        )}
        <a className="sn-supa" href={SUPANOTE_URL} target="_blank" rel="noopener noreferrer">Open Supanote ↗</a>
      </div>
      {adding && editor}

      {notes.length === 0 && !adding ? (
        <p className="sn-empty">No session notes yet. Add the first one. It&apos;s encrypted and only visible to this client&apos;s clinicians.</p>
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
