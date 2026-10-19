"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

// The mobile app's bottom tab bar. Five slots: Today, Calendar, a centre + that
// opens the Add sheet (Book / Block off time), Inbox (with an unread badge) and
// Me. Hidden on full-screen flows (Detail, Book, Edit, Block, Hours) so those
// read as their own pages.
const HIDE = [/^\/m\/appt\//, /^\/m\/book/, /^\/m\/block/, /^\/m\/hours/, /^\/m\/me\/edit/];

function Ic({ n }: { n: string }) {
  const c = { width: 23, height: 23, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (n === "today") return (<svg {...c}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></svg>);
  if (n === "calendar") return (<svg {...c}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 10h18M8 2v4M16 2v4M8 15h3" /></svg>);
  if (n === "inbox") return (<svg {...c}><path d="M3 13h5l1.5 2.5h5L16 13h5" /><path d="M5 5h14l2 8v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5z" /></svg>);
  if (n === "me") return (<svg {...c}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" /></svg>);
  return null;
}

export default function MobileNav({ unread = 0 }: { unread?: number }) {
  const pathname = usePathname() || "/m";
  const router = useRouter();
  const [add, setAdd] = useState(false);
  if (HIDE.some((re) => re.test(pathname))) return null;

  const tab = (href: string, active: boolean, icon: string, label: string, badge?: number) => (
    <a href={href} className={`mnav-item${active ? " on" : ""}`} aria-current={active ? "page" : undefined}>
      <span className="mnav-ic"><Ic n={icon} />{badge ? <span className="mnav-badge">{badge > 9 ? "9+" : badge}</span> : null}</span>
      <span className="mnav-lb">{label}</span>
    </a>
  );
  const go = (href: string) => { setAdd(false); router.push(href); };

  return (
    <>
      <nav className="mnav" aria-label="Scheduling">
        {tab("/m", pathname === "/m", "today", "Today")}
        {tab("/m/calendar", pathname.startsWith("/m/calendar"), "calendar", "Calendar")}
        <button className="mnav-add" onClick={() => setAdd(true)} aria-label="Add">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        {tab("/m/notifications", pathname.startsWith("/m/notifications"), "inbox", "Inbox", unread)}
        {tab("/m/me", pathname.startsWith("/m/me"), "me", "Me")}
      </nav>

      {add && (
        <div className="msheet-ov" onClick={() => setAdd(false)}>
          <div className="msheet" onClick={(e) => e.stopPropagation()}>
            <div className="msheet-grab" aria-hidden="true" />
            <div className="msheet-title">Add to your schedule</div>
            <button className="msheet-row" onClick={() => go("/m/book")}>
              <span className="msheet-row-ic t3"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4M12 13v4M10 15h4" /></svg></span>
              <span><b>Book an appointment</b><small>Add a session for a client</small></span>
              <span className="msheet-chev" aria-hidden="true">›</span>
            </button>
            <button className="msheet-row" onClick={() => go("/m/block")}>
              <span className="msheet-row-ic"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4M9 14l6 4M15 14l-6 4" /></svg></span>
              <span><b>Block off time</b><small>Lunch, admin, leave</small></span>
              <span className="msheet-chev" aria-hidden="true">›</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
