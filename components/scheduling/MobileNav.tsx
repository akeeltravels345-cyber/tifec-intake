"use client";

import { usePathname } from "next/navigation";

// The mobile scheduling app's OWN menu — a fixed bottom tab bar, completely
// separate from the web app's UnifiedSidebar. Changing one never affects the
// other. Keep this short: the calendar's own toolbar carries day/week, booking,
// sharing and session-logging, so this bar is just the top-level areas.
const ITEMS: { href: string; label: string; icon: React.ReactNode; match: (p: string) => boolean }[] = [
  {
    href: "/m",
    label: "Calendar",
    match: (p) => p === "/m",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" />
      </svg>
    ),
  },
  {
    href: "/m/hours",
    label: "Availability",
    match: (p) => p.startsWith("/m/hours"),
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    href: "/today",
    label: "Full app",
    match: () => false,
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 12l9-9 9 9M5 10v10h14V10" />
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
