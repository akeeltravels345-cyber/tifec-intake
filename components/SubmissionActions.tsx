"use client";

import { useState } from "react";

export default function SubmissionActions({ token }: { token: string }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirm("Permanently delete this submission? This cannot be undone.")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/submissions/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error("Delete failed.");
      window.location.href = "/dashboard";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
      setDeleting(false);
    }
  }

  return (
    <div className="no-print" style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <button type="button" className="btn-ghost" onClick={() => window.print()}>
        🖨 Print / Save PDF
      </button>
      <button type="button" className="btn-danger" onClick={remove} disabled={deleting}>
        {deleting ? "Deleting…" : "Delete"}
      </button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
