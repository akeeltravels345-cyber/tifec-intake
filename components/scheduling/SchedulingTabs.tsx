"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Two clear groups: the day-to-day (manage) and the configuration (set up).
const MANAGE = [
  { href: "/scheduling/calendar", label: "Calendar", icon: "cal" },
  { href: "/scheduling/waitlist", label: "Waitlist", icon: "users" },
  { href: "/schedule/intake", label: "Intake", icon: "clipboard" },
  { href: "/scheduling/reports", label: "Insights", icon: "chart" },
];
const SETUP = [
  { href: "/scheduling/types", label: "Services", icon: "list" },
  { href: "/scheduling/availability", label: "Availability", icon: "clock" },
  { href: "/scheduling/settings", label: "Settings", icon: "gear" },
];

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    cal: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    chart: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
    list: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>,
    clipboard: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M9 14l2 2 4-4" /></>,
    gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  };
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}

// In-page nav across the scheduling screens, so the sidebar keeps one entry.
export default function SchedulingTabs() {
  const path = usePathname();
  const link = (t: { href: string; label: string; icon: string }) => (
    <Link key={t.href} href={t.href} className={path.startsWith(t.href) ? "on" : ""}>
      <Icon name={t.icon} /><span>{t.label}</span>
    </Link>
  );
  return (
    <div className="sch-tabs">
      <div className="sch-tabs-head">
        <span className="sch-tabs-badge">Admin scheduling</span>
      </div>
      <nav className="sch-nav">
        <span className="sch-grp-lbl">Manage</span>
        {MANAGE.map(link)}
        <span className="sch-div" aria-hidden />
        <span className="sch-grp-lbl">Set up</span>
        {SETUP.map(link)}
      </nav>
    </div>
  );
}
