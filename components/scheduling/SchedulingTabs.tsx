"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/scheduling/calendar", label: "Calendar" },
  { href: "/scheduling/waitlist", label: "Waitlist" },
  { href: "/scheduling/reports", label: "Insights" },
  { href: "/scheduling/types", label: "Appointment types" },
  { href: "/scheduling/availability", label: "Availability" },
  { href: "/scheduling/settings", label: "Settings" },
];

// In-page nav across the scheduling screens, so the sidebar keeps one entry.
export default function SchedulingTabs() {
  const path = usePathname();
  return (
    <div className="sch-tabs">
      <div className="sch-tabs-inner">
        <span className="sch-tabs-badge">Scheduling · admin only</span>
        <nav>
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className={path.startsWith(t.href) ? "on" : ""}>{t.label}</Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
