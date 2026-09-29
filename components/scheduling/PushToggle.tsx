"use client";

import { useEffect, useState } from "react";

// Enable/disable web-push notifications on THIS device. Push subscriptions are
// per device, so a clinician turns them on wherever they want alerts.
function urlB64ToUint8(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function PushToggle() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(false);

  useEffect(() => {
    const ok = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setOn(!!sub))
      .catch(() => {});
  }, []);

  async function enable() {
    setBusy(true); setMsg(""); setErr(false);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setErr(true);
        setMsg(perm === "denied" ? "Notifications are blocked. Allow them for this site in your browser settings, then try again." : "Permission wasn't granted.");
        setBusy(false); return;
      }
      const reg = await navigator.serviceWorker.ready;
      const { key } = await fetch("/api/push/key").then((r) => r.json());
      if (!key) { setErr(true); setMsg("Not set up on the server yet — ask your admin."); setBusy(false); return; }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(key) });
      const j = sub.toJSON();
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: { endpoint: sub.endpoint, keys: j.keys } }) });
      if (!res.ok) throw new Error();
      setOn(true);
      await fetch("/api/push/test", { method: "POST" }).catch(() => {});
      setMsg("On. We just sent a test notification to this device.");
    } catch {
      setErr(true); setMsg("Couldn't turn on notifications. Please try again.");
    }
    setBusy(false);
  }

  async function disable() {
    setBusy(true); setMsg(""); setErr(false);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
        await sub.unsubscribe();
      }
      setOn(false);
    } catch {
      setErr(true); setMsg("Couldn't turn off. Please try again.");
    }
    setBusy(false);
  }

  return (
    <section className="calsub" style={{ marginTop: 16 }}>
      <h2 className="calsub-h">Notifications on this device</h2>
      <p className="calsub-p">Get an alert on your phone or computer when a client books with you, and your daily agenda each morning. Turn it on separately on each device you use.</p>
      {supported === false ? (
        <p className="calsub-p" style={{ marginTop: 4 }}>Not supported in this browser. On iPhone, add this app to your Home Screen first (Share → Add to Home Screen), open it from there, then turn notifications on.</p>
      ) : (
        <div className="push-row">
          {on ? (
            <><span className="push-state on">● On</span><button type="button" className="push-btn ghost" disabled={busy} onClick={disable}>{busy ? "…" : "Turn off"}</button></>
          ) : (
            <button type="button" className="push-btn" disabled={busy || supported === null} onClick={enable}>{busy ? "…" : "Turn on notifications"}</button>
          )}
        </div>
      )}
      {msg && <p className={`push-msg ${err ? "err" : "ok"}`}>{msg}</p>}
    </section>
  );
}
