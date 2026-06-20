"use client";

import { useEffect, useRef, useState } from "react";

export default function NotesEditor({
  token,
  initial,
}: {
  token: string;
  initial: string;
}) {
  const [notes, setNotes] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dirty = notes !== saved;

  // Debounced autosave 1.2s after the clinician stops typing.
  useEffect(() => {
    if (!dirty) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  async function save() {
    setStatus("saving");
    try {
      const res = await fetch("/api/submissions/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, notes }),
      });
      if (!res.ok) throw new Error();
      setSaved(notes);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="no-print">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="section-title">Clinician notes</h2>
        <span style={{ fontSize: 12, color: status === "error" ? "var(--danger)" : "var(--muted)" }}>
          {status === "saving" && "Saving…"}
          {status === "saved" && !dirty && "Saved ✓"}
          {status === "error" && "Save failed - retry"}
          {status === "idle" && dirty && "Unsaved changes"}
        </span>
      </div>
      <p className="section-desc">Private to your account. Encrypted at rest. Not shown to the client.</p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add private notes about this intake (autosaves)…"
        style={{ minHeight: 120 }}
      />
      {dirty && (
        <button className="primary" onClick={save} style={{ marginTop: 8 }}>
          Save notes
        </button>
      )}
    </div>
  );
}
