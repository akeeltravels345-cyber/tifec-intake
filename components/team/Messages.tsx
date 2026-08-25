"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { prepareUpload } from "@/lib/imageUpload";

interface Att { docId: string; kind: "image" | "audio" | "file"; name?: string | null }
interface Person { id: string; name: string; role: string }
interface Thread { id: string; name: string; lastBody: string; lastAt: string; unread: number; fromMe: boolean }
interface Msg { id: string; body: string; at: string; mine: boolean; who: string; attachments?: Att[] }

// A pending attachment on the message being typed (not yet sent).
interface Draft { id: string; kind: "image" | "audio" | "file"; mime: string; base64: string; url: string; name?: string }
const MAX_BYTES = 4 * 1024 * 1024;
const FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,application/pdf";
const rid = () => Math.random().toString(36).slice(2);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const fileIcon = (name?: string | null) => {
  const ext = (name || "").split(".").pop()?.toLowerCase();
  return ext === "pdf" ? "📄" : ext === "csv" || ext === "xls" || ext === "xlsx" ? "📊" : ext === "doc" || ext === "docx" ? "📝" : "📎";
};
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
// One saved attachment: image inline, voice note as a player, else a file link.
function AttView({ a }: { a: Att }) {
  const src = `/api/comms/ticket-image/${a.docId}`;
  if (a.kind === "audio") return <audio controls preload="none" className="tm-audio" src={src} />;
  if (a.kind === "file") return (
    <a href={src} target="_blank" rel="noreferrer" className="tm-file"><span className="ic">{fileIcon(a.name)}</span><span className="nm">{a.name || "Attachment"}</span></a>
  );
  return <a href={src} target="_blank" rel="noreferrer" className="tm-imgwrap"><img src={src} alt={a.name || "Attachment"} className="tm-img" /></a>;
}
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
  // Attachments being composed (images / files / voice notes).
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [attErr, setAttErr] = useState("");
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => { setDrafts([]); setAttErr(""); }, [threadId]);

  async function addFiles(list: FileList | null, asImage: boolean) {
    if (!list) return;
    setAttErr("");
    for (const f of Array.from(list)) {
      if (asImage && !f.type.startsWith("image/")) { setAttErr(`"${f.name}" isn't an image.`); continue; }
      if (!f.type.startsWith("image/") && f.size > MAX_BYTES) { setAttErr(`"${f.name}" is over 4 MB.`); continue; }
      const prepped = await prepareUpload(f);
      const size = Math.floor((prepped.base64.length * 3) / 4);
      if (!prepped.base64) { setAttErr(`Couldn't read "${f.name}".`); continue; }
      if (size > MAX_BYTES) { setAttErr(`"${f.name}" is too large even after shrinking. Try a smaller image.`); continue; }
      const kind = prepped.mime.startsWith("image/") ? "image" : prepped.mime.startsWith("audio/") ? "audio" : "file";
      setDrafts((d) => [...d, { id: rid(), kind, mime: prepped.mime, base64: prepped.base64, url: `data:${prepped.mime};base64,${prepped.base64}`, name: prepped.name }]);
    }
  }
  async function startRec() {
    setAttErr("");
    if (!navigator.mediaDevices?.getUserMedia) { setAttErr("This browser can't record audio."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        stream.getTracks().forEach((t) => t.stop());
        const mime = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size > MAX_BYTES) { setAttErr("That voice note is over 4 MB. Keep it shorter."); return; }
        const base64 = await blobToBase64(blob);
        setDrafts((d) => [...d, { id: rid(), kind: "audio", mime, base64, url: URL.createObjectURL(blob) }]);
      };
      rec.start();
      recRef.current = rec;
      setRecording(true); setRecSecs(0);
      timerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch { setAttErr("Couldn't reach the microphone. Allow mic access for this site and try again."); }
  }
  function stopRec() { recRef.current?.stop(); setRecording(false); }
  const removeDraft = (id: string) => setDrafts((d) => d.filter((x) => x.id !== id));
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
        setLive(j.messages.map((m: { id: string; body: string; createdAt: string; senderId: string; attachments?: Att[] }) => ({
          id: m.id, body: m.body, at: m.createdAt, mine: m.senderId === meId,
          who: m.senderId === meId ? "You" : (people.find((p) => p.id === m.senderId)?.name ?? threads.find((t) => t.id === activeWith)?.name ?? ""),
          attachments: m.attachments ?? [],
        })));
      } catch { /* offline: the next tick will catch up */ }
    };
    const h = setInterval(tick, 8000);
    return () => clearInterval(h);
  }, [threadId, meId, activeWith, threads]);

  function onSubmit(e: React.FormEvent) { e.preventDefault(); send(); }
  async function send() {
    const body = text.trim();
    const atts = drafts.map((d) => ({ base64: d.base64, mime: d.mime, name: d.name }));
    if ((!body && atts.length === 0) || busy || recording || !threadId) return;
    setBusy(true);
    // Show text straight away; the refresh below reconciles with the server (and
    // brings the saved attachments in). Attachment-only sends just wait for it.
    const optimistic: Msg = { id: `tmp-${Date.now()}`, body, at: new Date().toISOString(), mine: true, who: "You" };
    if (body) setLive((l) => [...l, optimistic]);
    setText(""); setDrafts([]);
    try {
      const res = await fetch("/api/comms", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", threadId, body, attachments: atts }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      if (body) setLive((l) => l.filter((m) => m.id !== optimistic.id));
      setText(body); setDrafts(drafts); // give them their words and files back
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
                        {m.body && <div className="tm-btext">{m.body}</div>}
                        {m.attachments && m.attachments.length > 0 && (
                          <div className="tm-batts">{m.attachments.map((a) => <AttView key={a.docId} a={a} />)}</div>
                        )}
                        <div className="tm-btime">{clock(m.at)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              <div className="tm-msgnote">
                <span>Encrypted, but not a clinical record. Use initials, not client names.</span>
                <Link href="/team/tickets" className="tm-msgticket">Need it tracked (payout, HR)? Raise a ticket instead →</Link>
              </div>
              {attErr && <p className="tm-err" style={{ margin: "0 0 8px" }}>{attErr}</p>}
              {drafts.length > 0 && (
                <div className="tm-drafts">
                  {drafts.map((d) => (
                    <span key={d.id} className={`tm-draft ${d.kind}`}>
                      {d.kind === "image" ? <img src={d.url} alt={d.name || "image"} />
                        : d.kind === "audio" ? <audio controls preload="metadata" src={d.url} />
                          : <span className="tm-filechip">{fileIcon(d.name)} {d.name}</span>}
                      <button type="button" onClick={() => removeDraft(d.id)} aria-label="Remove">×</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="tm-attbar">
                <label className="tm-attbtn">🖼 Image
                  <input type="file" accept="image/*" multiple onChange={(e) => { addFiles(e.target.files, true); e.currentTarget.value = ""; }} style={{ display: "none" }} />
                </label>
                <label className="tm-attbtn">📎 File
                  <input type="file" accept={FILE_ACCEPT} multiple onChange={(e) => { addFiles(e.target.files, false); e.currentTarget.value = ""; }} style={{ display: "none" }} />
                </label>
                {recording
                  ? <button type="button" className="tm-attbtn rec" onClick={stopRec}>⏹ Stop · {mmss(recSecs)}</button>
                  : <button type="button" className="tm-attbtn" onClick={startRec}>🎤 Voice note</button>}
              </div>
              <form className="tm-compose" onSubmit={onSubmit}>
                <textarea
                  ref={taRef} rows={1}
                  className="tm-in tm-composein" value={text} onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder={`Message ${active?.name?.split(" ")[0] ?? ""}...`} aria-label="Message"
                />
                <button className="tm-cta" type="submit" disabled={busy || recording || (!text.trim() && drafts.length === 0)}>Send</button>
              </form>
            </>
          )}
        </section>
      </div>
    </>
  );
}
