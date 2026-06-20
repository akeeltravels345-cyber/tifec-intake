"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface ListItem {
  token: string;
  name: string;
  concern: string;
  dateLabel: string;
  status: "new" | "reviewed" | "archived";
  statusLabel: string;
  hasNotes: boolean;
  coupleLabel?: string;
  clinicianName?: string; // shown in the admin all-practice view
}

export default function SubmissionList({ items }: { items: ListItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.concern.toLowerCase().includes(q) ||
        (i.clinicianName || "").toLowerCase().includes(q)
    );
  }, [items, query]);

  return (
    <div style={{ marginTop: 8 }}>
      <input
        type="search"
        placeholder="Search by client name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      {filtered.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>No matches for “{query}”.</p>
      ) : (
        filtered.map((i) => (
          <Link key={i.token} href={`/submissions/${i.token}`} className="sub-row">
            <div style={{ minWidth: 0 }}>
              <div className="sub-name">
                {i.name}
                {i.hasNotes && <span className="note-dot" title="Has clinician notes">✎</span>}
                {i.coupleLabel && <span className="couple-tag">👥 Couple</span>}
              </div>
              <div className="sub-meta">
                {i.clinicianName && <span className="sub-clinician">{i.clinicianName}</span>}
                {i.clinicianName && " · "}
                {i.dateLabel}
                {i.concern && <span> · {i.concern}</span>}
              </div>
              {i.coupleLabel && <div className="couple-meta">{i.coupleLabel}</div>}
            </div>
            <span className={`badge badge-${i.status}`}>{i.statusLabel}</span>
          </Link>
        ))
      )}
    </div>
  );
}
