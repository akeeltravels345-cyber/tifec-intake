"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface DashItem {
  token: string;
  name: string;
  concern: string;
  formLabel: string;
  dateLabel: string;
  status: "new" | "reviewed" | "archived";
  statusLabel: string;
  hasNotes: boolean;
  coupleLabel?: string;
}

// Each stat card doubles as a filter. `cls` ties it to its accent colour.
const CARDS = [
  { key: "new", label: "New", cls: "s-new" },
  { key: "reviewed", label: "Reviewed", cls: "s-reviewed" },
  { key: "archived", label: "Archived", cls: "s-archived" },
  { key: "all", label: "Total", cls: "s-total" },
] as const;

export default function DashboardSubmissions({
  items,
  status,
  onStatus,
}: {
  items: DashItem[];
  status: string;
  onStatus: (s: string) => void;
}) {
  const [query, setQuery] = useState("");

  const counts = useMemo(
    () => ({
      all: items.length,
      new: items.filter((i) => i.status === "new").length,
      reviewed: items.filter((i) => i.status === "reviewed").length,
      archived: items.filter((i) => i.status === "archived").length,
    }),
    [items]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (status === "all" || i.status === status) &&
        (!q || i.name.toLowerCase().includes(q) || i.concern.toLowerCase().includes(q))
    );
  }, [items, query, status]);

  return (
    <>
      <div className="stat-grid">
        {CARDS.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`stat stat-clickable ${c.cls} ${status === c.key ? "active" : ""}`}
            onClick={() => onStatus(c.key)}
            aria-pressed={status === c.key}
          >
            <div className="stat-num">{counts[c.key]}</div>
            <div className="stat-label">{c.label}</div>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="dash-search-row">
          <span className="dash-search-icon" aria-hidden>🔍</span>
          <input
            type="search"
            className="dash-search"
            placeholder="Search submissions by client name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search submissions"
          />
        </div>

        {status !== "all" && (
          <p className="dash-filter-note">
            Showing <strong>{CARDS.find((c) => c.key === status)?.label}</strong> submissions.{" "}
            <button type="button" className="dash-clear-filter" onClick={() => onStatus("all")}>
              Show all
            </button>
          </p>
        )}

        {items.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>
          No client has submitted your intake form yet. Share a form link above and completed forms appear here.
        </p>
      ) : filtered.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>
          {query ? `No submissions match “${query}”.` : "No forms in this view."}
        </p>
      ) : (
        <div style={{ marginTop: 8 }}>
          {filtered.map((i) => (
            <Link key={i.token} href={`/submissions/${i.token}`} className="sub-row">
              <div style={{ minWidth: 0 }}>
                <div className="sub-name">
                  {i.name}
                  {i.hasNotes && <span className="note-dot" title="Has clinician notes">✎</span>}
                  {i.coupleLabel && <span className="couple-tag">👥 Couple</span>}
                </div>
                <div className="sub-meta">
                  <span className="sub-form">{i.formLabel}</span>
                  <span className="sub-dot">·</span>
                  {i.dateLabel}
                </div>
              </div>
              <span className={`badge badge-${i.status}`}>{i.statusLabel}</span>
            </Link>
          ))}
        </div>
      )}
      </div>
    </>
  );
}
