"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NOTE_FORMATS, DEFAULT_FORMAT, type NoteFormat, type NoteContent } from "@/lib/noteFormats";

export interface NoteRow {
  id: string;
  clinicianId: string;
  author: string;
  noteDate: string;
  content: NoteContent;
  updatedAt: string;
}

// Where a clinician goes to write in Supanote. If your workspace lives at a
// different address, tell me and I'll change this one line.
const SUPANOTE_URL = "https://app.supanote.ai";

const FORMAT_KEYS = Object.keys(NOTE_FORMATS) as NoteFormat[];
const emptyFields = (f: NoteFormat): Record<string, string> =>
  Object.fromEntries(NOTE_FORMATS[f].fields.map((x) => [x.key, ""]));

// Split a note pasted from Supanote into the CURRENT format's sections by their
// headings (allowing a leading #, *, - or > and a : . - ) separator). Returns
// null when fewer than two headings are found, so an unstructured note is never
// mangled.
function splitByFormat(raw: string, format: NoteFormat): Record<string, string> | null {
  const text = raw.replace(/\r/g, "");
  const defs = NOTE_FORMATS[format].fields;
  const hits: { key: string; start: number; end: number }[] = [];
  for (const d of defs) {
    const re = new RegExp(`(?:^|\\n)[ \\t]*[#>*\\-]*[ \\t]*(?:${d.alts.join("|")})[ \\t]*[:.\\-–)]`, "i");
    const m = re.exec(text);
    if (m) hits.push({ key: d.key, start: m.index + (m[0][0] === "\n" ? 1 : 0), end: m.index + m[0].length });
  }
  if (hits.length < 2) return null;
  hits.sort((a, b) => a.start - b.start);
  const out = emptyFields(format);
  for (let i = 0; i < hits.length; i++) {
    out[hits[i].key] = text.slice(hits[i].end, i + 1 < hits.length ? hits[i + 1].start : undefined).trim();
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
  const [format, setFormat] = useState<NoteFormat>(DEFAULT_FORMAT);
  const [fields, setFields] = useState<Record<string, string>>(emptyFields(DEFAULT_FORMAT));
  const [paste, setPaste] = useState("");
  const [pasteMsg, setPasteMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Saved notes fold shut; open the ones you're reading.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function startAdd() { setEditId(null); setAdding(true); setDate(today); setFormat(DEFAULT_FORMAT); setFields(emptyFields(DEFAULT_FORMAT)); setPaste(""); setPasteMsg(""); setErr(""); }
  function startEdit(n: NoteRow) {
    setAdding(false); setEditId(n.id); setDate(n.noteDate);
    setFormat(n.content.format);
    setFields({ ...emptyFields(n.content.format), ...n.content.fields });
    setPaste(""); setPasteMsg(""); setErr("");
  }
  function cancel() { setAdding(false); setEditId(null); setFields(emptyFields(format)); setPaste(""); setPasteMsg(""); setErr(""); }

  // Switching format keeps any text whose section carries across (e.g. Plan).
  function changeFormat(f: NoteFormat) {
    setFields((cur) => { const next = emptyFields(f); for (const k of Object.keys(next)) if (cur[k]) next[k] = cur[k]; return next; });
    setFormat(f);
    setPasteMsg("");
  }

  // Lay a pasted Supanote note into the chosen format for review. If it splits
  // cleanly, fill the sections; if not, drop it all into the first box so nothing
  // is lost, and say so.
  function applyPaste(text: string) {
    if (!text.trim()) return;
    const defs = NOTE_FORMATS[format].fields;
    const parsed = splitByFormat(text, format);
    if (parsed) {
      setFields(parsed);
      setPasteMsg(`Split into ${defs.map((d) => d.label).join(" / ")}. Check the boxes below, then save.`);
    } else {
      const first = defs[0];
      setFields((s) => ({ ...s, [first.key]: [s[first.key], text.trim()].filter(Boolean).join("\n\n") }));
      setPasteMsg(`Couldn't spot ${NOTE_FORMATS[format].label} headings, so the whole note went into ${first.label}. Move any parts to the right box, then save.`);
    }
    setPaste("");
  }

  async function save() {
    if (!Object.values(fields).some((v) => v.trim())) { setErr("Write something in the note first."); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/billing/clients/${clientId}/notes`, {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(editId ? { noteId: editId } : {}), noteDate: date, format, fields }),
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
      <div className="sn-editrow">
        <label className="sn-datelab">Session date<input type="date" className="ls-in" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="sn-datelab">Note format
          <select className="ls-in" value={format} onChange={(e) => changeFormat(e.target.value as NoteFormat)}>
            {FORMAT_KEYS.map((f) => <option key={f} value={f}>{NOTE_FORMATS[f].label}</option>)}
          </select>
        </label>
      </div>
      <div className="sn-paste">
        <span className="sn-flab">Paste from Supanote <span className="opt">Write in Supanote, hit Copy, then paste here and we&apos;ll split it into the {NOTE_FORMATS[format].label} boxes below for you to review.</span></span>
        <textarea
          className="ls-in" rows={3} value={paste}
          placeholder="Paste a note copied from Supanote…"
          onChange={(e) => setPaste(e.target.value)}
          onPaste={(e) => { const t = e.clipboardData.getData("text"); if (t.trim()) { e.preventDefault(); applyPaste(t); } }}
        />
        <div className="sn-pasterow">
          {paste.trim() && <button type="button" className="sn-link" onClick={() => applyPaste(paste)}>Split into {NOTE_FORMATS[format].label} ↓</button>}
          {pasteMsg && <span className="sn-pastemsg">{pasteMsg}</span>}
        </div>
      </div>
      {NOTE_FORMATS[format].fields.map((f) => (
        <label className="sn-field" key={f.key}>
          <span className="sn-flab">{f.label} <span className="opt">{f.hint}</span></span>
          <textarea className="ls-in" rows={3} value={fields[f.key] ?? ""} onChange={(e) => setFields((s) => ({ ...s, [f.key]: e.target.value }))} />
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
          {notes.map((n, i) => {
            // Number sessions chronologically — oldest is Session 1. `notes` is newest-first.
            const sessionNo = notes.length - i;
            const fmt = NOTE_FORMATS[n.content.format];
            if (editId === n.id) return <div key={n.id}>{editor}</div>;
            const isOpen = open.has(n.id);
            return (
              <div className={`sn-note ${isOpen ? "open" : ""}`} key={n.id}>
                <div className="sn-headrow">
                  <button type="button" className="sn-head" onClick={() => toggle(n.id)} aria-expanded={isOpen}>
                    <span className={`sn-chev ${isOpen ? "open" : ""}`} aria-hidden="true">›</span>
                    <span className="sn-title">Session {sessionNo}</span>
                    <span className="sn-date">{n.noteDate}</span>
                    <span className="sn-fmt">{fmt.label}</span>
                    <span className="sn-by">{n.author}</span>
                  </button>
                  {n.clinicianId === meId && (
                    <span className="sn-headacts">
                      <button type="button" className="sn-link" onClick={() => startEdit(n)}>Edit</button>
                      <button type="button" className="sn-link del" onClick={() => remove(n.id)}>Delete</button>
                    </span>
                  )}
                </div>
                {isOpen && (
                  <div className="sn-body">
                    {fmt.fields.map((f) => (n.content.fields[f.key] || "").trim() ? (
                      <div className="sn-seg" key={f.key}><span className="sn-seglab">{f.label}</span><p>{n.content.fields[f.key]}</p></div>
                    ) : null)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
