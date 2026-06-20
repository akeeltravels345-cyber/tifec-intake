"use client";

import { useState } from "react";

const OPTIONS: { value: string; label: string }[] = [
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
  { value: "archived", label: "Archived" },
];

export default function StatusControl({
  token,
  initial,
}: {
  token: string;
  initial: string;
}) {
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: string) {
    if (next === status) return;
    const prev = status;
    setStatus(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/submissions/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, status: next }),
      });
      if (!res.ok) throw new Error("Could not update status.");
    } catch (e) {
      setStatus(prev);
      setError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, color: "var(--muted)" }}>Status:</span>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          disabled={busy}
          onClick={() => change(o.value)}
          className={`status-pill ${status === o.value ? "active" : ""}`}
        >
          {o.label}
        </button>
      ))}
      {error && <span className="error" style={{ marginLeft: 8 }}>{error}</span>}
    </div>
  );
}
