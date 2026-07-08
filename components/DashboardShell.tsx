"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import IdleLogout from "@/components/IdleLogout";
import FeedbackButton from "@/components/FeedbackButton";
import Tour from "@/components/Tour";

export interface DashItem {
  token: string;
  name: string;
  email: string;
  initials: string;
  formLabel: string;
  createdAt: string; // ISO
  status: "new" | "reviewed" | "archived";
  statusLabel: string;
  hasNotes: boolean;
  isCouple: boolean;
  isLinked: boolean;
}

type View = "dashboard" | "forms";
type Status = "all" | "new" | "reviewed" | "archived";

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const min = Math.floor((Date.now() - then) / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "Yesterday";
  if (day < 7) return `${day} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const S = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;
const home = (a: boolean) => (
  <svg width="18" height="18" viewBox="0 0 24 24" stroke={a ? "#319A9F" : "#8a9799"} strokeWidth="1.9" {...S}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
);
const file = (a: boolean) => (
  <svg width="18" height="18" viewBox="0 0 24 24" stroke={a ? "#319A9F" : "#8a9799"} strokeWidth="1.9" {...S}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
);
const star = (a: boolean) => (
  <svg width="18" height="18" viewBox="0 0 24 24" stroke={a ? "#319A9F" : "#8a9799"} strokeWidth="1.9" {...S}><polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.6 5.8 21 7 14 2 9.3 9 8.5" /></svg>
);
const search = (
  <svg width="16" height="16" viewBox="0 0 24 24" stroke="#9aa6a8" strokeWidth="2" {...S}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
);
const chevron = (
  <svg width="15" height="15" viewBox="0 0 24 24" stroke="#319A9F" strokeWidth="2.2" {...S}><polyline points="9 18 15 12 9 6" /></svg>
);
const shield = (
  <svg width="14" height="14" viewBox="0 0 24 24" stroke="#319A9F" strokeWidth="2" {...S}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
);
// Account-menu glyphs (inherit colour from the row).
const icCompass = (
  <svg width="15" height="15" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" {...S}><circle cx="12" cy="12" r="10" /><polygon points="16.2 7.8 14.1 14.1 7.8 16.2 9.9 9.9 16.2 7.8" /></svg>
);
const icLock = (
  <svg width="15" height="15" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" {...S}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
);
const icLogout = (
  <svg width="15" height="15" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" {...S}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
);

export default function DashboardShell({
  name,
  initials,
  isAdmin,
  needReview,
  items,
  formsSlot,
  tourToken,
  billingBeta,
  autoTour,
}: {
  name: string;
  initials: string;
  isAdmin: boolean;
  needReview: number;
  items: DashItem[];
  formsSlot: React.ReactNode;
  tourToken?: string;
  billingBeta?: boolean;
  autoTour?: boolean;
}) {
  const [view, setView] = useState<View>("dashboard");
  const [status, setStatus] = useState<Status>("new");
  const [query, setQuery] = useState("");

  // Let the guided tour switch to the Forms view when it reaches that step.
  useEffect(() => {
    const onSetView = (e: Event) => {
      const v = (e as CustomEvent).detail;
      if (v === "forms" || v === "dashboard") setView(v);
    };
    window.addEventListener("tifec-set-view", onSetView);
    return () => window.removeEventListener("tifec-set-view", onSetView);
  }, []);

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
        (!q ||
          i.name.toLowerCase().includes(q) ||
          i.email.toLowerCase().includes(q) ||
          i.formLabel.toLowerCase().includes(q))
    );
  }, [items, status, query]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const firstName =
    name.replace(/\(.*?\)/g, "").split(/\s+/).filter((w) => w && !/^(dr|mrs|mr|ms|miss)\.?$/i.test(w))[0] || name;
  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const KPI = [
    { key: "new", label: "NEW", value: counts.new, dot: "#e7c350", num: "#c9962f", trend: "to review", color: "#e7c350" },
    { key: "reviewed", label: "REVIEWED", value: counts.reviewed, dot: "#319A9F", num: "#319A9F", trend: "done", color: "#319A9F" },
    { key: "archived", label: "ARCHIVED", value: counts.archived, dot: "#c8d0d2", num: "#76828a", trend: "filed", color: "#c8d0d2" },
    { key: "all", label: "TOTAL", value: counts.all, dot: "#2E3192", num: "#2E3192", trend: "all time", color: "#2E3192" },
  ] as const;

  const filterWord = { all: "", new: "new", reviewed: "reviewed", archived: "archived" }[status];

  return (
    <div className="dm-shell">
      <IdleLogout />
      <Tour mount="dashboard" tourToken={tourToken} autoStart={!!autoTour} />

      <aside className="dm-side">
        <div className="dm-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tifec-mark.png" alt="TIFEC" />
          <div>
            <div className="dm-brand-name">TIFEC Intake</div>
            <div className="dm-brand-sub">Client Intake</div>
          </div>
        </div>

        <div className="dm-menu-label">MENU</div>
        <nav className="dm-nav">
          <button className={`dm-nav-item ${view === "dashboard" ? "active" : ""}`} onClick={() => setView("dashboard")}>
            {home(view === "dashboard")} Dashboard
            {needReview > 0 && <span className="dm-nav-badge">{needReview}</span>}
          </button>
          <button className={`dm-nav-item ${view === "forms" ? "active" : ""}`} onClick={() => setView("forms")}>
            {file(view === "forms")} Forms
          </button>
          {billingBeta && (
            <Link className="dm-nav-item" href="/billing">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
              Billing <span className="dm-beta">Beta</span>
            </Link>
          )}
          {isAdmin && (
            <Link className="dm-nav-item" href="/admin">
              {star(false)} Admin
            </Link>
          )}
        </nav>

        <div className="dm-spacer" />

        <FeedbackButton />

        <div className="dm-account">
          <div className="dm-user">
            <div className="dm-user-av">{initials}</div>
            <div className="dm-user-meta">
              <div className="dm-user-name">{firstName}</div>
              <div className="dm-user-role">{isAdmin ? "Admin" : "Clinician"}</div>
            </div>
          </div>
          <div className="dm-user-actions">
            <button onClick={() => window.dispatchEvent(new Event("tifec-tour"))}>{icCompass} Take a tour</button>
            <Link href="/account">{icLock} Change password</Link>
            <button className="danger" onClick={signOut}>{icLogout} Sign out</button>
          </div>
        </div>
      </aside>

      <main className="dm-main">
        {view === "dashboard" ? (
          <>
            <div className="dm-topbar">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 className="dm-greeting">
                  {greeting()}, {firstName}
                </h1>
                <div className="dm-subtitle">
                  {dateStr} ·{" "}
                  {needReview > 0 ? (
                    <button type="button" className="dm-review-link" onClick={() => setStatus("new")}>
                      {needReview} submission{needReview > 1 ? "s" : ""} waiting for review
                    </button>
                  ) : (
                    "you're all caught up"
                  )}
                </div>
              </div>
              <div className="dm-search">
                {search}
                <input
                  type="text"
                  placeholder="Search submissions…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search submissions"
                />
              </div>
              <div className="dm-avatar-sq">{initials}</div>
            </div>

            <div className="dm-kpis">
              {KPI.map((k) => (
                <button
                  key={k.key}
                  className={`dm-kpi ${status === k.key ? "active" : ""}`}
                  onClick={() => setStatus(k.key as Status)}
                  style={status === k.key ? { border: `1.5px solid ${k.color}` } : undefined}
                  aria-pressed={status === k.key}
                >
                  <div className="dm-kpi-top">
                    <span className="dm-kpi-label">
                      <span className="dm-kpi-dot" style={{ background: k.dot }} />
                      {k.label}
                    </span>
                  </div>
                  <div className="dm-kpi-num" style={{ color: k.num }}>
                    {k.value}
                  </div>
                </button>
              ))}
            </div>

            <div className="dm-toolbar">
              {status === "all" ? (
                <div className="dm-result">
                  {filtered.length} {filtered.length === 1 ? "client" : "clients"}
                  {items.length > 0 && <span className="dm-hint"> · tap a card above to filter</span>}
                </div>
              ) : (
                <div className="dm-result">
                  Showing <strong>{filtered.length}</strong> {filterWord}{" "}
                  {filtered.length === 1 ? "client" : "clients"}
                  <button type="button" className="dm-clear" onClick={() => setStatus("all")}>
                    Show all
                  </button>
                </div>
              )}
            </div>

            <div className="dm-list">
              {filtered.length === 0 ? (
                <div className="dm-empty">
                  <div className="dm-empty-title">No matching submissions</div>
                  <div style={{ fontSize: 13.5, marginTop: 6 }}>
                    {items.length === 0 ? "Completed forms will appear here." : "Try a different search or filter."}
                  </div>
                </div>
              ) : (
                <div className="dm-rows">
                  {filtered.map((r) => {
                    return (
                      <Link key={r.token} href={`/submissions/${r.token}`} className="dm-row">
                        <div className="dm-row-av">{r.initials}</div>
                        <div className="dm-row-main">
                          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0 }}>
                            <span className="dm-row-name">{r.name}</span>
                            {r.isCouple && <span className="dm-couple">Couple</span>}
                            {r.isLinked && (
                              <span className="dm-linked" title="This client has more than one form">
                                🔗 Linked
                              </span>
                            )}
                            {r.hasNotes && (
                              <span className="dm-note" title="Has clinician notes">
                                ✎ Note
                              </span>
                            )}
                          </div>
                          <div className="dm-row-email">{r.email || "No email provided"}</div>
                        </div>
                        <div className="dm-row-form">
                          <div className="dm-row-formtype">{r.formLabel}</div>
                          <div className="dm-row-time" title={new Date(r.createdAt).toLocaleString("en-US")}>
                            {relTime(r.createdAt)}
                          </div>
                        </div>
                        <span className={`dm-status dm-status-${r.status}`}>{r.statusLabel}</span>
                        <div className="dm-open">Open {chevron}</div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="dm-topbar">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 className="dm-greeting">Intake forms</h1>
                <div className="dm-subtitle">
                  Share the right link with each client. Completed forms appear under Dashboard.
                </div>
              </div>
              <div className="dm-pill-note">{shield} Consent included in every form</div>
              <div className="dm-avatar-sq">{initials}</div>
            </div>
            <div className="dm-content">{formsSlot}</div>
          </>
        )}
      </main>
    </div>
  );
}
