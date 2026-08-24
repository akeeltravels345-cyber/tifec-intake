"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Person { id: string; name: string; role: string }
interface Thread { id: string; name: string; lastBody: string; lastAt: string; unread: number; fromMe: boolean }
interface Msg { id: string; body: string; at: string; mine: boolean; who: string }
interface GroupThread { threadId: string; name: string; lastBody: string; lastAt: string; unread: number; memberCount: number }
interface GroupMember { id: string; name: string; isMe: boolean; isCreator: boolean }
interface ActiveGroup { threadId: string; name: string; canModerate: boolean; members: GroupMember[] }

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
// Online if active within the last 3 minutes.
const isOnline = (iso?: string) => !!iso && Date.now() - new Date(iso).getTime() < 3 * 60000;
const lastSeen = (iso?: string) => {
  if (!iso) return "offline";
  if (isOnline(iso)) return "online";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `last seen ${min}m ago`;
  if (min < 1440) return `last seen ${Math.floor(min / 60)}h ago`;
  return `last seen ${new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
};

export default function Messages({ meId, people, threads, messages, activeWith, threadId, everyone, groups = [], activeGroup = null, presence = {} }: {
  meId: string; people: Person[]; threads: Thread[]; messages: Msg[]; activeWith: string; threadId: string;
  everyone?: { unread: number; lastBody: string; lastAt: string };
  groups?: GroupThread[];
  activeGroup?: ActiveGroup | null;
  presence?: Record<string, string>;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<Msg[]>(messages);
  // "New group" creation state.
  const [creating, setCreating] = useState(false);
  const [gName, setGName] = useState("");
  const [gMembers, setGMembers] = useState<string[]>([]);
  const [gBusy, setGBusy] = useState(false);
  const [gErr, setGErr] = useState("");
  // "Manage group" state.
  const [managing, setManaging] = useState(false);
  const [mBusy, setMBusy] = useState(false);
  const [mErr, setMErr] = useState("");
  const [renaming, setRenaming] = useState("");
  useEffect(() => { setManaging(false); }, [threadId]);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setLive(messages); }, [messages]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [live.length]);
  // Presence heartbeat: stay "online" while this tab is open and visible.
  useEffect(() => {
    const ping = () => { if (!document.hidden) fetch("/api/comms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ping" }) }).catch(() => {}); };
    ping();
    const h = setInterval(ping, 45000);
    return () => clearInterval(h);
  }, []);
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

  async function createGroup() {
    const name = gName.trim();
    if (!name) { setGErr("Give the group a name."); return; }
    if (gMembers.length === 0) { setGErr("Add at least one other person."); return; }
    setGBusy(true); setGErr("");
    try {
      const res = await fetch("/api/comms", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "group:create", name, memberIds: gMembers }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not create the group.");
      setCreating(false); setGName(""); setGMembers([]);
      router.push(`/team/messages?to=${j.threadId}`);
    } catch (e) { setGErr(e instanceof Error ? e.message : "Could not create the group."); }
    finally { setGBusy(false); }
  }
  const toggleMember = (id: string) => setGMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  // Manage members: add / remove / rename / leave. Each posts then refreshes.
  async function manageAction(payload: Record<string, unknown>, onOk?: () => void) {
    setMBusy(true); setMErr("");
    try {
      const res = await fetch("/api/comms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not update the group.");
      if (onOk) onOk(); else router.refresh();
      return j;
    } catch (e) { setMErr(e instanceof Error ? e.message : "Could not update the group."); }
    finally { setMBusy(false); }
  }
  const addToGroup = (id: string) => manageAction({ action: "group:addMembers", threadId, memberIds: [id] });
  const removeFromGroup = (id: string) => manageAction({ action: "group:removeMember", threadId, memberId: id });
  const renameGroupChat = () => { const name = renaming.trim(); if (name) manageAction({ action: "group:rename", threadId, name }); };
  const leaveGroup = () => manageAction({ action: "group:leave", threadId }, () => { setManaging(false); router.push("/team/messages"); });

  const isTeam = activeWith === "all";
  const isCustomGroup = activeWith.startsWith("group:");
  const isGroupLike = isTeam || isCustomGroup;
  const active = isTeam
    ? { id: "all", name: "Everyone", role: `Whole team · ${people.length + 1} people` }
    : isCustomGroup && activeGroup
      ? { id: activeGroup.threadId, name: activeGroup.name, role: `${activeGroup.members.length} people · ${activeGroup.members.map((m) => m.name).join(", ")}` }
      : people.find((p) => p.id === activeWith) ?? threads.find((t) => t.id === activeWith);
  const nonMembers = activeGroup ? people.filter((p) => !activeGroup.members.some((m) => m.id === p.id)) : [];
  const started = new Set(threads.map((t) => t.id));
  const notStarted = people.filter((p) => !started.has(p.id));

  return (
    <>
      <div className="tm-head">
        <div>
          <h1 className="tm-h1">Messages</h1>
          <p className="tm-sub">Direct chats and groups. Please keep client names and clinical detail out of here.</p>
        </div>
      </div>

      <div className="tm-chat">
        <aside className="tm-people">
          <Link href="/team/messages?to=all" className={`tm-person tm-everyone ${isTeam ? "on" : ""}`}>
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
          <button type="button" className="tm-newgrp" onClick={() => { setCreating(true); setGErr(""); }}>
            <span className="tm-newgrp-ic">＋</span> New group
          </button>

          {groups.length > 0 && <div className="tm-plabel">Groups</div>}
          {groups.map((g) => (
            <Link key={g.threadId} href={`/team/messages?to=${g.threadId}`} className={`tm-person ${activeWith === g.threadId ? "on" : ""}`}>
              <span className="tm-av grp">◇</span>
              <span className="tm-pmid">
                <span className="tm-pname">{g.name}</span>
                <span className="tm-plast">{g.lastBody ? g.lastBody : `${g.memberCount} people`}</span>
              </span>
              <span className="tm-pright">
                {g.lastAt ? <span className="tm-pwhen">{brief(g.lastAt)}</span> : null}
                {g.unread > 0 ? <span className="tm-badge">{g.unread}</span> : null}
              </span>
            </Link>
          ))}

          {threads.length > 0 && <div className="tm-plabel">Conversations</div>}
          {threads.map((t) => (
            <Link key={t.id} href={`/team/messages?to=${t.id}`} className={`tm-person ${activeWith === t.id ? "on" : ""}`}>
              <span className="tm-avwrap"><span className="tm-av">{initials(t.name)}</span>{isOnline(presence[t.id]) && <span className="tm-dot" title="Online" />}</span>
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
              <span className="tm-avwrap"><span className="tm-av">{initials(p.name)}</span>{isOnline(presence[p.id]) && <span className="tm-dot" title="Online" />}</span>
              <span className="tm-pmid">
                <span className="tm-pname">{p.name}</span>
                <span className="tm-plast">{isOnline(presence[p.id]) ? "online" : p.role}</span>
              </span>
            </Link>
          ))}
        </aside>

        <section className="tm-thread">
          {creating ? (
            <div className="tm-newgroup">
              <div className="tm-ng-head">
                <div className="tm-ng-title">New group chat</div>
                <button type="button" className="tm-ng-x" onClick={() => setCreating(false)} aria-label="Cancel">×</button>
              </div>
              <label className="tm-ng-label">Group name</label>
              <input className="tm-in" value={gName} onChange={(e) => setGName(e.target.value)} placeholder="e.g. Billing team" maxLength={80} autoFocus />
              <label className="tm-ng-label">Add people <span className="tm-ng-count">{gMembers.length} selected</span></label>
              <div className="tm-ng-people">
                {people.map((p) => (
                  <label key={p.id} className={`tm-ng-person ${gMembers.includes(p.id) ? "on" : ""}`}>
                    <input type="checkbox" checked={gMembers.includes(p.id)} onChange={() => toggleMember(p.id)} />
                    <span className="tm-av sm">{initials(p.name)}</span>
                    <span className="tm-ng-pn"><span className="tm-pname">{p.name}</span><span className="tm-plast">{p.role}</span></span>
                  </label>
                ))}
              </div>
              {gErr && <div className="tm-ng-err">{gErr}</div>}
              <div className="tm-ng-actions">
                <button type="button" className="tm-ng-cancel" onClick={() => setCreating(false)}>Cancel</button>
                <button type="button" className="tm-cta" onClick={createGroup} disabled={gBusy || !gName.trim() || gMembers.length === 0}>{gBusy ? "Creating…" : "Create group"}</button>
              </div>
            </div>
          ) : !activeWith ? (
            <div className="tm-empty">
              <div className="big">Pick someone to talk to</div>
              <div className="small">Your conversations stay private. Start a group with the ＋ button.</div>
            </div>
          ) : (
            <>
              <div className="tm-thead">
                <span className="tm-avwrap"><span className={`tm-av ${isGroupLike ? "grp" : ""}`}>{isTeam ? "★" : isCustomGroup ? "◇" : initials(active?.name ?? "")}</span>{!isGroupLike && isOnline(presence[activeWith]) && <span className="tm-dot" title="Online" />}</span>
                <div>
                  <div className="tm-pname">{active?.name}</div>
                  <div className="tm-prole">{isGroupLike ? (active as Person).role : (isOnline(presence[activeWith]) ? "Online now" : lastSeen(presence[activeWith]))}</div>
                </div>
                {isCustomGroup && activeGroup && (
                  <button type="button" className="tm-manage" onClick={() => { setManaging((v) => !v); setRenaming(activeGroup.name); setMErr(""); }}>
                    {managing ? "Done" : "Manage"}
                  </button>
                )}
              </div>

              {managing && isCustomGroup && activeGroup && (
                <div className="tm-manage-panel">
                  <div className="tm-mp-row">
                    <input className="tm-in" value={renaming} onChange={(e) => setRenaming(e.target.value)} maxLength={80} aria-label="Group name" />
                    <button type="button" className="tm-mp-btn" onClick={renameGroupChat} disabled={mBusy || !renaming.trim() || renaming.trim() === activeGroup.name}>Rename</button>
                  </div>

                  <div className="tm-mp-label">Members</div>
                  {activeGroup.members.map((m) => (
                    <div key={m.id} className="tm-mp-member">
                      <span className="tm-av sm">{initials(m.isMe ? "You" : m.name)}</span>
                      <span className="tm-mp-name">{m.name}{m.isCreator && <span className="tm-mp-tag">creator</span>}</span>
                      {!m.isMe && activeGroup.canModerate && <button type="button" className="tm-mp-x" onClick={() => removeFromGroup(m.id)} disabled={mBusy} aria-label={`Remove ${m.name}`}>Remove</button>}
                    </div>
                  ))}

                  {nonMembers.length > 0 && <div className="tm-mp-label">Add people</div>}
                  {nonMembers.map((p) => (
                    <div key={p.id} className="tm-mp-member">
                      <span className="tm-av sm">{initials(p.name)}</span>
                      <span className="tm-mp-name">{p.name}<span className="tm-mp-role">{p.role}</span></span>
                      <button type="button" className="tm-mp-add" onClick={() => addToGroup(p.id)} disabled={mBusy}>Add</button>
                    </div>
                  ))}

                  {mErr && <div className="tm-ng-err">{mErr}</div>}
                  <div className="tm-mp-foot">
                    <button type="button" className="tm-mp-leave" onClick={leaveGroup} disabled={mBusy}>Leave group</button>
                  </div>
                </div>
              )}

              <div className="tm-msgs">
                {live.length === 0 && <p className="tm-none">No messages yet. Say hello.</p>}
                {live.map((m, i) => {
                  const showDay = i === 0 || dayLabel(m.at) !== dayLabel(live[i - 1].at);
                  return (
                    <div key={m.id}>
                      {showDay && <div className="tm-day"><span>{dayLabel(m.at)}</span></div>}
                      <div className={`tm-bubble ${m.mine ? "me" : ""}`}>
                        {isGroupLike && !m.mine && m.who && <div className="tm-bwho">{m.who}</div>}
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
