"use client";

import Link from "next/link";
import { useState } from "react";
import DashboardSubmissions, { type DashItem } from "@/components/DashboardSubmissions";
import IdleLogout from "@/components/IdleLogout";

type View = "dashboard" | "forms";

export default function DashboardShell({
  name,
  initials,
  isAdmin,
  needReview,
  items,
  formsSlot,
}: {
  name: string;
  initials: string;
  isAdmin: boolean;
  needReview: number;
  items: DashItem[];
  formsSlot: React.ReactNode;
}) {
  const [view, setView] = useState<View>("dashboard");
  const [status, setStatus] = useState<string>("all");

  function showNeedsReview() {
    setView("dashboard");
    setStatus("new");
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="dash-shell">
      <IdleLogout />
      <aside className="dash-side">
        <nav className="dash-nav">
          <button
            type="button"
            className={`dash-nav-item ${view === "dashboard" ? "active" : ""}`}
            onClick={() => setView("dashboard")}
            aria-current={view === "dashboard"}
          >
            <span className="dash-nav-ico" aria-hidden>🏠</span>
            Dashboard
            {needReview > 0 && <span className="dash-nav-badge">{needReview}</span>}
          </button>
          <button
            type="button"
            className={`dash-nav-item ${view === "forms" ? "active" : ""}`}
            onClick={() => setView("forms")}
            aria-current={view === "forms"}
          >
            <span className="dash-nav-ico" aria-hidden>📄</span>
            Forms
          </button>
          {isAdmin && (
            <Link href="/admin" className="dash-nav-item dash-nav-admin">
              <span className="dash-nav-ico" aria-hidden>★</span>
              Admin
            </Link>
          )}
        </nav>
        <div className="dash-side-foot">
          <Link href="/account" className="dash-nav-item">
            <span className="dash-nav-ico" aria-hidden>🔑</span>
            Change password
          </Link>
          <button type="button" className="dash-nav-item" onClick={signOut}>
            <span className="dash-nav-ico" aria-hidden>↩</span>
            Sign out
          </button>
        </div>
      </aside>

      <main className="dash-main">
        <div className="dash-head">
          <div>
            <h1 className="dash-greeting">Welcome back, {name}</h1>
            {needReview > 0 ? (
              <button
                type="button"
                className="dash-subcue alert dash-subcue-link"
                onClick={showNeedsReview}
              >
                {needReview} submission{needReview > 1 ? "s" : ""} need{needReview > 1 ? "" : "s"} review
                <span className="dash-subcue-arrow" aria-hidden>→</span>
              </button>
            ) : (
              <p className="dash-subcue">You&apos;re all caught up</p>
            )}
          </div>
          <div className="avatar">{initials}</div>
        </div>

        {view === "forms" ? (
          <div className="card dash-forms-view">{formsSlot}</div>
        ) : (
          <DashboardSubmissions items={items} status={status} onStatus={setStatus} />
        )}
      </main>
    </div>
  );
}
