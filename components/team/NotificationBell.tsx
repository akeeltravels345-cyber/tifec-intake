"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Note {
  id: string;
  kind: "message" | "ticket_new" | "ticket_reply" | "ticket_status" | "notice";
  body: string;
  href: string;
  createdAt: string;
  readAt: string | null;
}

const ICON: Record<Note["kind"], string> = {
  message: "💬",
  ticket_new: "🎫",
  ticket_reply: "↩️",
  ticket_status: "✅",
  notice: "📌",
};

const ago = (iso: string) => {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  if (min < 1440) return `${Math.floor(min / 60)}h ago`;
  const d = Math.floor(min / 1440);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [notes, setNotes] = useState<Note[]>([]);
  const wrap = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape, like any other menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  // No websockets on this host, so poll quietly; pauses when the tab is hidden.
  useEffect(() => {
    const tick = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/comms?notifications=1");
        if (!r.ok) return;
        const j = await r.json();
        setNotes(j.notifications);
        setUnread(j.notifications.filter((n: Note) => !n.readAt).length);
      } catch { /* offline: the next tick catches up */ }
    };
    tick();
    const h = setInterval(tick, 30000);
    return () => clearInterval(h);
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    const r = await fetch("/api/comms?notifications=1");
    if (r.ok) setNotes((await r.json()).notifications);
    if (unread > 0) {
      // Opening the list is reading it.
      await fetch("/api/comms", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "notifications:read" }),
      });
      setUnread(0);
      router.refresh();
    }
  }

  return (
    <div className="tm-bellwrap" ref={wrap}>
      <button className="tm-bell" onClick={toggle} aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`} aria-expanded={open}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && <span className="tm-belldot">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="tm-bellpanel" role="menu">
          <div className="tm-bellhead">Notifications</div>
          {notes.length === 0 ? (
            <p className="tm-bellempty">Nothing yet. New messages, tickets and notices show up here.</p>
          ) : (
            notes.map((n) => (
              <Link key={n.id} href={n.href} className={`tm-bellrow ${n.readAt ? "" : "new"}`} onClick={() => setOpen(false)}>
                <span className="ic" aria-hidden="true">{ICON[n.kind]}</span>
                <span className="tx">
                  <span className="bd">{n.body}</span>
                  <span className="wh">{ago(n.createdAt)}</span>
                </span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
