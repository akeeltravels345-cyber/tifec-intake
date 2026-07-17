"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { BillingRole } from "@/lib/billingRole";

const IconOverview = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 13h8V3H3zM13 21h8V3h-8zM3 21h8v-6H3z" /></svg>);
const IconClin = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" /></svg>);
const IconUser = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" /></svg>);
const IconQueue = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4M4 6v12a2 2 0 0 0 2 2h14v-4" /></svg>);
const IconSetup = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1" /></svg>);
const IconLog = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>);

interface NavItem { href: string; label: string; icon: React.FC; badge?: number; match: (p: string) => boolean; }

export default function BillingSidebar({
  role, meId, name, initials, roleLabel, queueCount, isDev,
}: { role: BillingRole; meId: string; name: string; initials: string; roleLabel: string; queueCount: number; isDev: boolean; }) {
  const path = usePathname();
  const myDetail = `/billing/clinician/${meId}`;

  const nav: NavItem[] =
    role === "biller"
      ? [
          { href: "/billing/biller", label: "Dashboard", icon: IconOverview, match: (p) => p === "/billing/biller" || p === "/billing" },
          { href: "/billing/payments", label: "Billing queue", icon: IconQueue, badge: queueCount, match: (p) => p.startsWith("/billing/payments") },
          { href: "/billing/outside", label: "Outside clients", icon: IconClin, match: (p) => p.startsWith("/billing/outside") },
        ]
      : role === "clinician"
        ? [
            { href: "/billing/me", label: "My payout", icon: IconClin, match: (p) => p.startsWith("/billing/clinician") || p === "/billing/me" },
            { href: "/billing/sessions/new", label: "Log a session", icon: IconLog, match: (p) => p.startsWith("/billing/sessions") },
          ]
        : [
            { href: "/billing/overview", label: "Overview", icon: IconOverview, match: (p) => p === "/billing/overview" || p === "/billing" },
            { href: "/billing/me", label: "My clients", icon: IconUser, match: (p) => p === "/billing/me" || p.startsWith(myDetail) },
            { href: "/billing/clinicians", label: "By clinician", icon: IconClin, match: (p) => p === "/billing/clinicians" || (p.startsWith("/billing/clinician/") && !p.startsWith(myDetail)) },
            { href: "/billing/payments", label: "Billing queue", icon: IconQueue, badge: queueCount, match: (p) => p.startsWith("/billing/payments") },
            { href: "/billing/config", label: "Setup", icon: IconSetup, match: (p) => p.startsWith("/billing/config") },
          ];

  function viewAs(r: "owner" | "clinician" | "biller") {
    const who = r === "owner" ? "shion-oconnor" : r === "clinician" ? "donnet-oconnor" : "nick-oconnor";
    document.cookie = `dev_role=${r}; path=/; max-age=31536000`;
    document.cookie = `dev_as=${who}; path=/; max-age=31536000`;
    window.location.href = r === "owner" ? "/billing/overview" : r === "clinician" ? "/billing/me" : "/billing/biller";
  }

  async function signOut() {
    // Clear the dev "View as" override too, so sign-out really logs out.
    document.cookie = "dev_role=; path=/; max-age=0";
    document.cookie = "dev_as=; path=/; max-age=0";
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login?next=/billing";
  }

  const sectionLabel = role === "biller" ? "Billing" : "Practice";

  return (
    <>
    <aside className="bo-side">
      <div className="bo-brand">
        <img className="bo-logo" src="/tifec-mark.png" alt="TIFEC" />
        <div><div className="bo-bt">TIFEC Billing</div><div className="bo-bs">Essential Care</div></div>
      </div>

      <Link href="/dashboard" className="bo-backlink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        Back to intake
      </Link>

      <div className="bo-navl">{sectionLabel}</div>
      <nav className="bo-nav">
        {nav.map((n) => {
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} className={n.match(path) ? "on" : ""}>
              <Icon />{n.label}
              {n.badge ? <span className="bdg">{n.badge}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div className="bo-side-foot">
        {isDev && (
          <>
            <div className="bo-viewas">View as</div>
            <div className="bo-roles">
              {(["owner", "biller"] as const).map((r) => (
                <button key={r} type="button" className={`bo-role ${role === r ? "on" : ""}`} onClick={() => viewAs(r)}>
                  {r[0].toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="bo-usr">
          <div className="bo-uav">{initials}</div>
          <div style={{ minWidth: 0 }}><div className="bo-un">{name}</div><div className="bo-ur">{roleLabel}</div></div>
          <button type="button" className="bo-signout" onClick={signOut} title="Sign out" aria-label="Sign out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
          </button>
        </div>
      </div>
    </aside>

    <nav className="bo-mobtabs">
      <Link href="/dashboard">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        Intake
      </Link>
      {nav.map((n) => {
        const Icon = n.icon;
        return (
          <Link key={n.href} href={n.href} className={n.match(path) ? "on" : ""}>
            <Icon />{n.label.split(" ")[0]}
            {n.badge ? <span className="bdg">{n.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
    </>
  );
}
