"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Notif = { id: string; type: string; title: string; body: string; url: string; apptId: string | null; createdAt: string; readAt: string | null };

function urlB64ToUint8(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

const rel = (iso: string) => {
  const t = Date.parse(iso); if (!Number.isFinite(t)) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 172800) return "yesterday";
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

export default function MobileNotifications({ items, remindersOn, pushAvailable }: { items: Notif[]; remindersOn: boolean; pushAvailable: boolean }) {
  const router = useRouter();
  const [list, setList] = useState<Notif[]>(items);
  const [reminders, setReminders] = useState(remindersOn);

  // Push enable state for THIS device.
  const [supported, setSupported] = useState<boolean | null>(null);
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const ok = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (ok) navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((s) => setPushOn(!!s)).catch(() => {});
  }, []);

  // Clear the unread badge: mark everything read as soon as the inbox opens.
  const marked = useRef(false);
  useEffect(() => {
    if (marked.current || !list.some((n) => !n.readAt)) return;
    marked.current = true;
    fetch("/api/scheduling/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "readAll" }) })
      .then(() => router.refresh())
      .catch(() => {});
  }, [list, router]);

  async function enablePush() {
    setBusy(true); setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setMsg({ ok: false, text: perm === "denied" ? "Notifications are blocked. Allow them for this app in your settings, then try again." : "Permission wasn't granted." }); setBusy(false); return; }
      const reg = await navigator.serviceWorker.ready;
      const { key } = await fetch("/api/push/key").then((r) => r.json());
      if (!key) { setMsg({ ok: false, text: "Not set up on the server yet — ask your admin." }); setBusy(false); return; }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(key) });
      const j = sub.toJSON();
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: { endpoint: sub.endpoint, keys: j.keys } }) });
      if (!res.ok) throw new Error();
      setPushOn(true);
      await fetch("/api/push/test", { method: "POST" }).catch(() => {});
      setMsg({ ok: true, text: "On. We just sent a test notification to this device." });
    } catch { setMsg({ ok: false, text: "Couldn't turn on notifications. Please try again." }); }
    setBusy(false);
  }

  async function disablePush() {
    setBusy(true); setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {}); await sub.unsubscribe(); }
      setPushOn(false); setMsg(null);
    } catch { setMsg({ ok: false, text: "Couldn't turn off. Please try again." }); }
    setBusy(false);
  }

  async function toggleReminders() {
    const next = !reminders;
    setReminders(next);
    try {
      const res = await fetch("/api/scheduling/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apptReminders: next }) });
      if (!res.ok) throw new Error();
    } catch { setReminders(!next); }
  }

  function open(n: Notif) {
    if (!n.readAt) fetch("/api/scheduling/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read", id: n.id }) }).catch(() => {});
    router.push(n.url || "/m");
  }

  return (
    <div className="mnot">
      <header className="mnot-head">
        <a href="/m" className="mnot-back" aria-label="Back"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg></a>
        <div className="mnot-title">Notifications</div>
      </header>

      <div className="mnot-body">
        {/* Turn push on/off for this phone */}
        <div className="mnot-card">
          <div className="mnot-set">
            <div>
              <div className="mnot-set-t">Alerts on this phone</div>
              <div className="mnot-set-s">New bookings, changes and reminders, pushed to this device.</div>
            </div>
            {supported === false ? null : pushOn ? (
              <button className="mnot-sw on" disabled={busy} onClick={disablePush} aria-pressed="true"><span /></button>
            ) : (
              <button className="mnot-sw" disabled={busy || supported === null || !pushAvailable} onClick={enablePush} aria-pressed="false"><span /></button>
            )}
          </div>
          {supported === false && (
            <div className="mnot-note">To get alerts on iPhone, add this app to your Home Screen first (Share → Add to Home Screen), open it from there, then turn alerts on.</div>
          )}
          {supported !== false && !pushAvailable && <div className="mnot-note">Push isn&apos;t set up on the server yet — ask your admin.</div>}
          {msg && <div className={`mnot-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}

          <div className="mnot-set" style={{ borderTop: "1px solid #eef1f2", marginTop: 12, paddingTop: 12 }}>
            <div>
              <div className="mnot-set-t">Remind me before appointments</div>
              <div className="mnot-set-s">A heads-up about 30 minutes before each visit.</div>
            </div>
            <button className={`mnot-sw ${reminders ? "on" : ""}`} onClick={toggleReminders} aria-pressed={reminders}><span /></button>
          </div>
        </div>

        {/* Inbox */}
        {list.length === 0 ? (
          <div className="mnot-empty">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
            <p>No notifications yet. New bookings, changes and reminders will show up here.</p>
          </div>
        ) : (
          <div className="mnot-list">
            {list.map((n) => (
              <button key={n.id} className={`mnot-item${n.readAt ? "" : " unread"}`} onClick={() => open(n)}>
                <span className={`mnot-ic ${n.type}`}><Ic n={n.type} /></span>
                <span className="mnot-item-main">
                  <span className="mnot-item-top"><span className="mnot-item-title">{n.title}</span><span className="mnot-item-time">{rel(n.createdAt)}</span></span>
                  <span className="mnot-item-body">{n.body}</span>
                </span>
                {!n.readAt && <span className="mnot-dot" aria-hidden="true" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Ic({ n }: { n: string }) {
  const c = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (n === "cancel") return (<svg {...c}><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></svg>);
  if (n === "reschedule") return (<svg {...c}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
  if (n === "reminder") return (<svg {...c}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>);
  return (<svg {...c}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4M12 13v4M10 15h4" /></svg>); // booking: calendar +
}
