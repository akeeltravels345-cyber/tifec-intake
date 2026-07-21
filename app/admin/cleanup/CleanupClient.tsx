"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DemoRecord } from "@/lib/demoCleanup";

export default function CleanupClient({ records }: { records: DemoRecord[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Group by clinician so it is obvious whose dashboard each record sits on.
  const groups = useMemo(() => {
    const g: Record<string, DemoRecord[]> = {};
    for (const r of records) (g[r.clinicianName] ||= []).push(r);
    return g;
  }, [records]);

  const toggle = (token: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });

  const toggleGroup = (list: DemoRecord[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = list.every((r) => next.has(r.token));
      list.forEach((r) => (allOn ? next.delete(r.token) : next.add(r.token)));
      return next;
    });

  const selectAll = () =>
    setSelected((prev) => (prev.size === records.length ? new Set() : new Set(records.map((r) => r.token))));

  async function remove() {
    if (selected.size === 0) return;
    if (!confirm(`Permanently delete ${selected.size} demo record${selected.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/admin/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens: [...selected] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Delete failed.");
      setDone(`Deleted ${body.deleted} record${body.deleted === 1 ? "" : "s"}.${body.refused ? ` ${body.refused} skipped.` : ""}`);
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  if (records.length === 0) {
    return (
      <div className="card">
        <h2 className="section-title">No demo records found</h2>
        <p className="section-desc" style={{ margin: 0 }}>
          Nothing on the system carries the <strong>(DEMO)</strong> marker. Real client records are never listed here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="status-pill" onClick={selectAll}>
          {selected.size === records.length ? "Clear selection" : `Select all ${records.length}`}
        </button>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          {selected.size} of {records.length} selected
        </span>
        <span style={{ flex: 1 }} />
        {done && <span className="msg-ok" style={{ fontSize: 13 }}>{done}</span>}
        {error && <span className="error" style={{ fontSize: 13 }}>{error}</span>}
        <button
          type="button"
          className="primary"
          disabled={busy || selected.size === 0}
          onClick={remove}
          style={{ background: selected.size ? "var(--danger, #c0392b)" : undefined }}
        >
          {busy ? "Deleting…" : `Delete selected (${selected.size})`}
        </button>
      </div>

      {Object.entries(groups).map(([clinician, list]) => (
        <div className="card" key={clinician}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
            <h2 className="section-title" style={{ margin: 0 }}>{clinician}</h2>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{list.length} demo record{list.length === 1 ? "" : "s"}</span>
            <span style={{ flex: 1 }} />
            <button type="button" className="status-pill" onClick={() => toggleGroup(list)}>
              {list.every((r) => selected.has(r.token)) ? "Unselect all" : "Select all"}
            </button>
          </div>

          {list.map((r) => (
            <label
              key={r.token}
              className="answer-row"
              style={{ display: "flex", gap: 12, alignItems: "center", cursor: "pointer" }}
            >
              <input type="checkbox" checked={selected.has(r.token)} onChange={() => toggle(r.token)} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>{r.name}</strong>
                {r.isCouple && <span className="badge" style={{ marginLeft: 8 }}>Couple</span>}
                <span style={{ display: "block", fontSize: 12.5, color: "var(--muted)" }}>
                  {r.formLabel} · {new Date(r.createdAt).toLocaleDateString("en-US")} · {r.status}
                </span>
              </span>
            </label>
          ))}
        </div>
      ))}
    </>
  );
}
