"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { chime, soundOn, setSoundOn } from "./chime";

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
  const [banner, setBanner] = useState<Note | null>(null);
  const [muted, setMuted] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Ids already accounted for. Seeded on the first poll so arriving at the page
  // doesn't replay a chime for everything waiting.
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => setMuted(!soundOn()), []);

  const pull = useCallback(async (): Promise<Note[] | null> => {
    try {
      const r = await fetch("/api/comms?notifications=1");
      if (!r.ok) return null;
      const list: Note[] = (await r.json()).notifications;
      setNotes(list);
      setUnread(list.filter((n) => !n.readAt).length);

      if (seen.current === null) {
        seen.current = new Set(list.map((n) => n.id));
        // Surface an announcement that arrived while they were away.
        const notice = list.find((n) => n.kind === "notice" && !n.readAt);
        if (notice) setBanner(notice);
      } else {
        const fresh = list.filter((n) => !seen.current!.has(n.id));
        fresh.forEach((n) => seen.current!.add(n.id));
        const notice = fresh.find((n) => n.kind === "notice");
        if (notice) { setBanner(notice); chime("notice"); }
        else if (fresh.length > 0) chime("message");
      }
      return list;
    } catch {
      return null; // offline; the next tick catches up
    }
  }, []);

  useEffect(() => {
    void pull();
    // Deliberately polls even when the tab is in the background: a chime is
    // most useful exactly when you're not looking at this tab, and browsers
    // already throttle background timers. It's one small request.
    const h = setInterval(() => { void pull(); }, 20000);
    return () => clearInterval(h);
  }, [pull]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  async function markRead() {
    await fetch("/api/comms", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "notifications:read" }),
    });
    setUnread(0);
    setNotes((l) => l.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    router.refresh();
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    await pull();
    if (unread > 0) await markRead();
  }

  function toggleSound() {
    const on = muted;           // muted → turning on
    setSoundOn(on);
    setMuted(!on);
    if (on) chime("message");   // confirm audibly that it's back on
  }

  return (
    <>
      {banner && (
        <div className="tm-banner" role="status">
          <span className="ic" aria-hidden="true">📣</span>
          <span className="tx">
            <b>New announcement</b> — {banner.body.replace(/ posted a notice$/, " posted to the notice board")}
          </span>
          <Link href="/team/notices" className="go" onClick={() => setBanner(null)}>Read it</Link>
          <button className="x" onClick={() => setBanner(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      <div className="tm-bellwrap" ref={wrap}>
        <button className="tm-bell" onClick={toggle} aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`} aria-expanded={open}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          {unread > 0 && <span className="tm-belldot">{unread > 9 ? "9+" : unread}</span>}
        </button>

        {open && (
          <div className="tm-bellpanel" role="menu">
            <div className="tm-bellhead">
              Notifications
              <button className="snd" onClick={toggleSound} title={muted ? "Sound is off" : "Sound is on"}>
                {muted ? "🔕 Sound off" : "🔔 Sound on"}
              </button>
            </div>
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
    </>
  );
}
