"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/team/notices", label: "Notice board" },
  { href: "/team/messages", label: "Messages" },
  { href: "/team/tickets", label: "Tickets" },
];

export default function TeamTabs({ unread }: { unread: number }) {
  const path = usePathname();
  return (
    <nav className="tm-tabs">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={`tm-tab ${path.startsWith(t.href) ? "on" : ""}`}>
          {t.label}
          {t.href === "/team/messages" && unread > 0 && <span className="tm-badge">{unread}</span>}
        </Link>
      ))}
    </nav>
  );
}
