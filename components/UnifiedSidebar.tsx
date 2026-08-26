"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { SidebarData } from "@/lib/sidebarData";
import NotificationBell from "@/components/team/NotificationBell";

const S = (d: React.ReactNode) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d}</svg>);
const IcToday = () => S(<><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>);
const IcDoc = () => S(<><path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1z" /><path d="M8 4H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" /><path d="M8 11h8M8 15h5" /></>);
const IcForms = () => S(<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>);
const IcOverview = () => S(<path d="M3 13h8V3H3zM13 21h8V3h-8zM3 21h8v-6H3z" />);
const IcClin = () => S(<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" />);
const IcUser = () => S(<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" />);
const IcQueue = () => S(<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4M4 6v12a2 2 0 0 0 2 2h14v-4" />);
const IcLog = () => S(<path d="M12 5v14M5 12h14" />);
const IcBoard = () => S(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>);
const IcChat = () => S(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />);
const IcTicket = () => S(<><path d="M4 9V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" /><path d="M13 5v14" /></>);
const IcOwed = () => S(<><path d="M3 6h18v12H3z" /><path d="M3 10h18" /><circle cx="8" cy="14" r="1.4" /></>);
const IcWork = () => S(<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></>);
const IcKey = () => S(<><circle cx="8" cy="15" r="4" /><path d="M10.85 12.15 19 4M18 5l2 2M15 8l2 2" /></>);
const IcSetup = () => S(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>);

interface Item { href: string; label: string; icon: React.FC; badge?: number; match: (p: string) => boolean; glow?: string; highlight?: boolean; }
interface Group { label: string; items: Item[]; }

function initialsOf(name: string): string {
  const parts = name.replace(/\(.*?\)/g, "").replace(/^(Dr\.?|Mrs\.?|Mr\.?|Ms\.?|Miss)\s+/i, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export default function UnifiedSidebar({ data, isDev = false }: { data: SidebarData; isDev?: boolean }) {
  const path = usePathname();
  const tab = useSearchParams().get("tab");
  const { role, hasBilling, isAdmin, meId, name, queueCount, needReview, teamUnread, openTickets, importPending, noteCount, notesEnabled, canSwitchViews, viewingAsRole, viewingAsName, switchTargets } = data;
  const owner = role === "owner", biller = role === "biller";

  // Glow the nav entry that leads to a new feature, for a person's first 3
  // sessions, then stop. Shares the "copaynav" budget with the KPI glow on the
  // destination page, so both fade together. Advances once per session.
  const [navGlow, setNavGlow] = useState(false);
  useEffect(() => {
    try {
      const countKey = "glow_copaynav_count";
      const count = Number(localStorage.getItem(countKey) || "0");
      if (count >= 3) return;
      const sessKey = "glow_copaynav_session";
      if (!sessionStorage.getItem(sessKey)) {
        localStorage.setItem(countKey, String(count + 1));
        sessionStorage.setItem(sessKey, "1");
      }
      setNavGlow(true);
    } catch { /* storage unavailable — no glow */ }
  }, []);


  // Items every role shares, identical for all — defined once and reused so each
  // admin "view" can be a faithful, complete replica of that role's real menu.
  const uToday: Item = { href: "/today", label: "Today", icon: IcToday, match: (p) => p === "/today" };
  const uDash: Item = { href: "/dashboard", label: "Dashboard", icon: IcDoc, badge: needReview, match: (p) => p === "/dashboard" && tab !== "forms" };
  const uForms: Item = { href: "/dashboard?tab=forms", label: "Forms", icon: IcForms, match: (p) => p === "/dashboard" && tab === "forms" };
  const uNotices: Item = { href: "/team/notices", label: "Notice board", icon: IcBoard, match: (p) => p.startsWith("/team/notices") };
  const uMessages: Item = { href: "/team/messages", label: "Messages", icon: IcChat, badge: teamUnread, match: (p) => p.startsWith("/team/messages") };
  const uTickets: Item = { href: "/team/tickets", label: "Tickets", icon: IcTicket, badge: openTickets, match: (p) => p.startsWith("/team/tickets") };

  let groups: Group[];
  if (isAdmin && hasBilling) {
    // The admin's own menu is intentionally lean: just their admin tools + team.
    // Billing / intake / clinician screens are reached by "viewing as" that role
    // via the switcher at the top of the sidebar — no duplicated menus here.
    groups = [
      { label: "", items: [uToday] },
      { label: "Team", items: [uNotices, uMessages, uTickets] },
      { label: "Admin", items: [
        { href: "/billing/config", label: "Setup", icon: IcSetup, match: (p) => p.startsWith("/billing/config") },
        { href: "/billing/worklist", label: "Worklist", icon: IcWork, match: (p) => p.startsWith("/billing/worklist") },
        { href: "/admin", label: "Logins & oversight", icon: IcKey, match: (p) => p === "/admin" },
      ] },
    ];
  } else {
    groups = [
      { label: "", items: [uToday] },
      { label: "Intake", items: [uDash, uForms] },
    ];
    if (hasBilling) {
      const billing: Item[] = owner
        ? [
            { href: "/billing/overview", label: "Overview", icon: IcOverview, match: (p) => p === "/billing/overview" || p === "/billing" },
            { href: "/billing/clinicians", label: "By clinician", icon: IcClin, match: (p) => p === "/billing/clinicians" || p.startsWith("/billing/clinician/") },
            { href: "/billing/payments", label: "Billing queue", icon: IcQueue, badge: queueCount, match: (p) => p.startsWith("/billing/payments") },
            { href: "/billing/balances", label: "Owed by clients", icon: IcOwed, match: (p) => p.startsWith("/billing/balances"), glow: "copaynav" },
            { href: "/billing/clients", label: "Clients", icon: IcUser, match: (p) => p.startsWith("/billing/clients") },
            ...(notesEnabled ? [{ href: "/notes", label: "Session notes", icon: IcDoc, match: (p: string) => p.startsWith("/notes") }] : []),
            { href: "/billing/import/review", label: "Import review", icon: IcWork, badge: importPending, match: (p) => p.startsWith("/billing/import/review") },
          ]
        : biller
          ? [
              { href: "/billing/biller", label: "Biller dashboard", icon: IcOverview, match: (p) => p === "/billing/biller" || p === "/billing" },
              { href: "/billing/payments", label: "Billing queue", icon: IcQueue, badge: queueCount, match: (p) => p.startsWith("/billing/payments") },
              { href: "/billing/clinicians", label: "By clinician", icon: IcClin, match: (p) => p === "/billing/clinicians" || p.startsWith("/billing/clinician/") },
              { href: "/billing/balances", label: "Owed by clients", icon: IcOwed, match: (p) => p.startsWith("/billing/balances"), glow: "copaynav" },
              { href: "/billing/clients", label: "Clients", icon: IcUser, match: (p) => p.startsWith("/billing/clients") },
              { href: "/billing/import/review", label: "Import review", icon: IcWork, badge: importPending, match: (p) => p.startsWith("/billing/import/review") },
              { href: "/billing/import", label: "Import", icon: IcLog, match: (p) => p === "/billing/import" },
              { href: "/billing/fix-dates", label: "Fix dates", icon: IcSetup, match: (p) => p.startsWith("/billing/fix-dates"), highlight: true },
            ]
          : [
              { href: "/billing/me", label: "My payout", icon: IcClin, match: (p) => p === "/billing/me" || p.startsWith("/billing/clinician"), glow: "copaynav" },
              { href: "/billing/clients", label: "My clients", icon: IcUser, match: (p) => p.startsWith("/billing/clients") },
              ...(notesEnabled ? [{ href: "/notes", label: "Session notes", icon: IcDoc, match: (p: string) => p.startsWith("/notes") }] : []),
              { href: "/billing/sessions/new", label: "Log a session", icon: IcLog, match: (p) => p.startsWith("/billing/sessions") },
            ];
      groups.push({ label: "Billing", items: billing });
    }
    groups.push({ label: "Team", items: [uNotices, uMessages, uTickets] });
    const adminItems: Item[] = [];
    if (hasBilling && (owner || biller)) adminItems.push({ href: "/billing/config", label: "Setup", icon: IcSetup, match: (p) => p.startsWith("/billing/config") });
    if (hasBilling && (owner || biller)) adminItems.push({ href: "/billing/worklist", label: "Worklist", icon: IcWork, match: (p) => p.startsWith("/billing/worklist") });
    if (hasBilling && !owner && !biller) adminItems.push({ href: "/billing/me/setup", label: "My setup", icon: IcSetup, match: (p) => p.startsWith("/billing/me/setup") });
    if (adminItems.length) groups.push({ label: owner || biller ? "Practice admin" : "You", items: adminItems });
  }

  // Mobile bottom bar is a single flat row — dedupe repeated shared items (Today,
  // Team, etc. recur across the admin's role sections) so each appears once.
  const flatSeen = new Set<string>();
  const flat: Item[] = [];
  for (const g of groups) for (const it of g.items) {
    if (it.label === "Forms" || flatSeen.has(it.href)) continue;
    flatSeen.add(it.href);
    flat.push(it);
  }
  const roleLabel = isAdmin ? "Admin" : owner ? "Owner" : biller ? "Biller" : "Clinician";

  function viewAs(r: "owner" | "clinician" | "biller") {
    const who = r === "owner" ? "shion-oconnor" : r === "clinician" ? "donnet-oconnor" : "nick-oconnor";
    document.cookie = `dev_role=${r}; path=/; max-age=31536000`;
    document.cookie = `dev_as=${who}; path=/; max-age=31536000`;
    window.location.href = "/today";
  }
  // Admin "Viewing as": set (or clear) the server-checked admin_as cookie and land
  // on that role's home. Only the system admin can do this; the server enforces it.
  function switchView(target: "me" | "owner" | "biller" | "clinician") {
    if (target === "me") {
      document.cookie = "admin_as=; path=/; max-age=0";
      window.location.href = "/today";
      return;
    }
    const id = switchTargets[target];
    if (!id) return;
    document.cookie = `admin_as=${id}; path=/; max-age=31536000`;
    window.location.href = target === "owner" ? "/billing/overview" : target === "biller" ? "/billing/biller" : "/billing/me";
  }
  const SWITCHES = [["me", "Me"], ["owner", "Owner"], ["biller", "Biller"], ["clinician", "Clinician"]] as const;
  async function signOut() {
    document.cookie = "dev_role=; path=/; max-age=0";
    document.cookie = "dev_as=; path=/; max-age=0";
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login?next=/today";
  }

  return (
    <>
      <aside className="bo-side">
        <div className="bo-brandrow">
          <Link href="/today" className="bo-brand">
            <img className="bo-logo" src="/tifec-mark.png" alt="TIFEC" />
            <div><div className="bo-bt">TIFEC</div><div className="bo-bs">Essential Care</div></div>
          </Link>
          <NotificationBell initialUnread={noteCount} unreadMessages={teamUnread} />
        </div>

        {canSwitchViews && (
          <div className="bo-switch">
            <div className="bo-switch-lab">Viewing as</div>
            <div className="bo-switch-seg">
              {SWITCHES.map(([key, label]) => {
                const active = (viewingAsRole ?? "me") === key;
                const disabled = key !== "me" && !switchTargets[key];
                return (
                  <button key={key} type="button" className={`bo-switch-btn ${active ? "on" : ""}`} disabled={disabled} onClick={() => switchView(key)}>{label}</button>
                );
              })}
            </div>
            {viewingAsRole && (
              <button type="button" className="bo-switch-back" onClick={() => switchView("me")}>
                ← Back to my admin{viewingAsName ? ` · you are seeing ${viewingAsName}'s view` : ""}
              </button>
            )}
          </div>
        )}

        <nav className="bo-nav">
          {groups.map((g, gi) => (
            <div key={g.label || gi}>
              {g.label && <div className="bo-navl" style={gi === 0 ? undefined : { marginTop: 14 }}>{g.label}</div>}
              {g.items.map((n) => {
                const Icon = n.icon;
                const glowing = !!n.highlight || (!!n.glow && navGlow);
                return (
                  <Link key={n.href} href={n.href} className={`${n.match(path) ? "on" : ""}${glowing ? " bo-navglow" : ""}`}>
                    <Icon />{n.label}
                    {n.badge ? <span className="bdg">{n.badge}</span> : glowing ? <span className="bo-newchip">New</span> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="bo-side-foot">
          {isDev && (
            <>
              <div className="bo-viewas">View as</div>
              <div className="bo-roles">
                {(["owner", "biller", "clinician"] as const).map((r) => (
                  <button key={r} type="button" className={`bo-role ${role === r ? "on" : ""}`} onClick={() => viewAs(r)}>{r[0].toUpperCase() + r.slice(1)}</button>
                ))}
              </div>
            </>
          )}
          <div className="bo-usr">
            <div className="bo-uav">{initialsOf(name)}</div>
            <div style={{ minWidth: 0 }}><div className="bo-un">{name}</div><div className="bo-ur">{roleLabel}</div></div>
            <button type="button" className="bo-signout" onClick={signOut} title="Sign out" aria-label="Sign out">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            </button>
          </div>
          <Link href="/account" className="bo-acctlink">Change password</Link>
        </div>
      </aside>

      <nav className="bo-mobtabs">
        {flat.map((n) => {
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} className={`${n.match(path) ? "on" : ""}${n.highlight ? " bo-mobglow" : ""}`}>
              <Icon />{n.label.startsWith("My ") ? n.label.slice(3).replace(/^./, (c) => c.toUpperCase()) : n.label.split(" ")[0]}
              {n.badge ? <span className="bdg">{n.badge}</span> : null}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
