"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ALL = [
  { href: "/team/notices", label: "Notice board", contactOnly: true },
  { href: "/team/messages", label: "Messages", contactOnly: false },
  { href: "/team/tickets", label: "Tickets", contactOnly: true },
];

export default function TeamTabs({ unread, isContact }: { unread: number; isContact: boolean }) {
  const path = usePathname();
  // Clinicians get Messages only, so a single tab would just be noise.
  const tabs = ALL.filter((t) => isContact || !t.contactOnly);
  if (tabs.length < 2) return null;

  return (
    <nav className="tm-tabs">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={`tm-tab ${path.startsWith(t.href) ? "on" : ""}`}>
          {t.label}
          {t.href === "/team/messages" && unread > 0 && <span className="tm-badge">{unread}</span>}
        </Link>
      ))}
    </nav>
  );
}
