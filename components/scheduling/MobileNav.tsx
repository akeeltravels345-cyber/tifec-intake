"use client";

import { usePathname } from "next/navigation";

// The mobile scheduling app's own bottom tab bar. Two tabs: Today (agenda) and
// Calendar (month overview). Availability + booking link + sign-out live behind
// the avatar on the Today header, not as tabs.
const ITEMS: { href: string; label: string; icon: React.ReactNode; match: (p: string) => boolean }[] = [
  {
    href: "/m",
    label: "Today",
    match: (p) => p === "/m",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" />
      </svg>
    ),
  },
  {
    href: "/m/calendar",
    label: "Calendar",
    match: (p) => p.startsWith("/m/calendar"),
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" />
      </svg>
    ),
  },
];

export default function MobileNav() {
  const pathname = usePathname() || "/m";
  return (
    <nav className="mnav" aria-label="Scheduling">
      {ITEMS.map((it) => {
        const active = it.match(pathname);
        return (
          <a key={it.href} href={it.href} className={`mnav-item${active ? " on" : ""}`} aria-current={active ? "page" : undefined}>
            <span className="mnav-ic">{it.icon}</span>
            <span className="mnav-lb">{it.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
