"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Person { id: string; name: string; role: string }
interface Thread { id: string; name: string; lastBody: string; lastAt: string; unread: number; fromMe: boolean }
interface Msg { id: string; body: string; at: string; mine: boolean; who: string }

const initials = (n: string) => {
  // Drop titles and anything parenthetical ("Akeel (Test)" must not give "A(").
  const p = n.replace(/\(.*?\)/g, "").replace(/^(Dr\.?|Mrs\.?|Mr\.?|Ms\.?|Miss)\s+/i, "")
    .split(/\s+/).map((w) => w.replace(/[^A-Za-z]/g, "")).filter(Boolean);
  return ((p[0]?.[0] ?? "?") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
};
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const dayLabel = (iso: string) => {
  const d = new Date(iso), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return "Today";
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
};
const brief = (iso: string) => {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.floor(min / 60)}h`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function Messages({ meId, people, threads, messages, activeWith, threadId, everyone }: {
  meId: string; people: Person[]; threads: Thread[]; messages: Msg[]; activeWith: string; threadId: string;
  everyone?: { unread: number; lastBody: string; lastAt: string };
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<Msg[]>(messages);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setLive(messages); }, [messages]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [live.length]);
  // Grow the compose box with the text (up to a few lines), shrink back on send.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  // No websockets on this hosting, so poll while a thread is open. Cheap at
  // this size, and it stops when the tab is hidden.
  useEffect(() => {
    if (!threadId) return;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/comms?thread=${encodeURIComponent(threadId)}`);
        if (!res.ok) return;
        const j = await res.json();
        setLive(j.messages.map((m: { id: string; body: string; createdAt: string; senderId: string }) => ({
          id: m.id, body: m.body, at: m.createdAt, mine: m.senderId === meId,
          who: m.senderId === meId ? "You" : (people.find((p) => p.id === m.senderId)?.name ?? threads.find((t) => t.id === activeWith)?.name ?? ""),
        })));
      } catch { /* offline: the next tick will catch up */ }
    };
    const h = setInterval(tick, 8000);
    return () => clearInterval(h);
  }, [threadId, meId, activeWith, threads]);

  function onSubmit(e: React.FormEvent) { e.preventDefault(); send(); }
  async function send() {
    const body = text.trim();
    if (!body || busy || !threadId) return;
    setBusy(true);
    // Show it straight away; the refresh below reconciles with the server.
    const optimistic: Msg = { id: `tmp-${Date.now()}`, body, at: new Date().toISOString(), mine: true, who: "You" };
    setLive((l) => [...l, optimistic]);
    setText("");
    try {
      const res = await fetch("/api/comms", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", threadId, body }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setLive((l) => l.filter((m) => m.id !== optimistic.id));
      setText(body); // give them their words back rather than losing them
    } finally { setBusy(false); }
  }

  const isGroup = activeWith === "all";
  const active = isGroup
    ? { id: "all", name: "Everyone", role: `Whole team · ${people.length + 1} people` }
    : people.find((p) => p.id === activeWith) ?? threads.find((t) => t.id === activeWith);
  const started = new Set(threads.map((t) => t.id));
  const notStarted = people.filter((p) => !started.has(p.id));

  return (
    <>
      <div className="tm-head">
        <div>
          <h1 className="tm-h1">Messages</h1>
          <p className="tm-sub">Private, one to one. Please keep client names and clinical detail out of here.</p>
        </div>
      </div>

      <div className="tm-chat">
        <aside className="tm-people">
          <Link href="/team/messages?to=all" className={`tm-person tm-everyone ${isGroup ? "on" : ""}`}>
            <span className="tm-av grp">★</span>
            <span className="tm-pmid">
              <span className="tm-pname">Everyone</span>
              <span className="tm-plast">{everyone?.lastBody ? everyone.lastBody : "Message the whole team"}</span>
            </span>
            <span className="tm-pright">
              {everyone?.lastAt ? <span className="tm-pwhen">{brief(everyone.lastAt)}</span> : null}
              {everyone && everyone.unread > 0 ? <span className="tm-badge">{everyone.unread}</span> : null}
            </span>
          </Link>
          {threads.length > 0 && <div className="tm-plabel">Conversations</div>}
          {threads.map((t) => (
            <Link key={t.id} href={`/team/messages?to=${t.id}`} className={`tm-person ${activeWith === t.id ? "on" : ""}`}>
              <span className="tm-av">{initials(t.name)}</span>
              <span className="tm-pmid">
                <span className="tm-pname">{t.name}</span>
                <span className="tm-plast">{t.fromMe && "You: "}{t.lastBody}</span>
              </span>
              <span className="tm-pright">
                <span className="tm-pwhen">{brief(t.lastAt)}</span>
                {t.unread > 0 && <span className="tm-badge">{t.unread}</span>}
              </span>
            </Link>
          ))}

          {notStarted.length > 0 && <div className="tm-plabel">Start a conversation</div>}
          {notStarted.map((p) => (
            <Link key={p.id} href={`/team/messages?to=${p.id}`} className={`tm-person ${activeWith === p.id ? "on" : ""}`}>
              <span className="tm-av">{initials(p.name)}</span>
              <span className="tm-pmid">
                <span className="tm-pname">{p.name}</span>
                <span className="tm-plast">{p.role}</span>
              </span>
            </Link>
          ))}
        </aside>

        <section className="tm-thread">
          {!activeWith ? (
            <div className="tm-empty">
              <div className="big">Pick someone to talk to</div>
              <div className="small">Your conversations stay private between the two of you.</div>
            </div>
          ) : (
            <>
              <div className="tm-thead">
                <span className="tm-av">{initials(active?.name ?? "")}</span>
                <div>
                  <div className="tm-pname">{active?.name}</div>
                  <div className="tm-prole">{"role" in (active ?? {}) ? (active as Person).role : ""}</div>
                </div>
              </div>

              <div className="tm-msgs">
                {live.length === 0 && <p className="tm-none">No messages yet. Say hello.</p>}
                {live.map((m, i) => {
                  const showDay = i === 0 || dayLabel(m.at) !== dayLabel(live[i - 1].at);
                  return (
                    <div key={m.id}>
                      {showDay && <div className="tm-day"><span>{dayLabel(m.at)}</span></div>}
                      <div className={`tm-bubble ${m.mine ? "me" : ""}`}>
                        {isGroup && !m.mine && m.who && <div className="tm-bwho">{m.who}</div>}
                        <div className="tm-btext">{m.body}</div>
                        <div className="tm-btime">{clock(m.at)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              <div className="tm-msgnote">
                <span>Encrypted, but not a clinical record — use initials, not client names.</span>
                <Link href="/team/tickets" className="tm-msgticket">Need it tracked (payout, HR)? Raise a ticket instead →</Link>
              </div>
              <form className="tm-compose" onSubmit={onSubmit}>
                <textarea
                  ref={taRef} rows={1}
                  className="tm-in tm-composein" value={text} onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder={`Message ${active?.name?.split(" ")[0] ?? ""}...`} aria-label="Message"
                />
                <button className="tm-cta" type="submit" disabled={busy || !text.trim()}>Send</button>
              </form>
            </>
          )}
        </section>
      </div>
    </>
  );
}
