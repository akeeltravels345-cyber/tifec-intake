"use client";

import { useEffect, useState } from "react";

// First-run SETUP wizard: gets a clinician ready on their phone in a few steps.
// Hours and other account settings are managed in the web dashboard and carry
// over automatically (same availability data), so this covers only the
// mobile-specific bits: notifications on this device, and the booking link.
// Shows once (localStorage), skippable, replayable from Me via /m?setup=1.
export const SETUP_KEY = "m-setup-v1";

function urlB64ToUint8(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64); const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
const Ic = (p: React.ReactNode) => (<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p}</svg>);

export default function MobileSetup({ myId, onClose }: { myId: string; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const LAST = 3;

  // Push
  const [pushSupported, setPushSupported] = useState<boolean | null>(null);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Link
  const [copied, setCopied] = useState(false);
  const bookingUrl = typeof window !== "undefined" ? `${window.location.origin}/book?clinician=${encodeURIComponent(myId)}` : "";

  useEffect(() => {
    const ok = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setPushSupported(ok);
    if (ok) navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((s) => setPushOn(!!s)).catch(() => {});
  }, []);
  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, []);

  const finish = () => { try { localStorage.setItem(SETUP_KEY, "done"); } catch { /* ignore */ } onClose(); };

  async function enablePush() {
    setPushBusy(true); setPushMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setPushMsg({ ok: false, text: perm === "denied" ? "Notifications are blocked. Allow them for this app in your settings." : "Permission wasn't granted." }); setPushBusy(false); return; }
      const reg = await navigator.serviceWorker.ready;
      const { key } = await fetch("/api/push/key").then((r) => r.json());
      if (!key) { setPushMsg({ ok: false, text: "Not set up on the server yet, ask your admin." }); setPushBusy(false); return; }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(key) });
      const j = sub.toJSON();
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: { endpoint: sub.endpoint, keys: j.keys } }) });
      if (!res.ok) throw new Error();
      setPushOn(true); setPushMsg({ ok: true, text: "On. Alerts will come to this phone." });
    } catch { setPushMsg({ ok: false, text: "Couldn't turn on notifications. Try again." }); }
    setPushBusy(false);
  }
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(bookingUrl); }
    catch { try { const ta = document.createElement("textarea"); ta.value = bookingUrl; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); } catch { /* ignore */ } }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  const shareLink = async () => {
    const nav = navigator as Navigator & { share?: (d: { title?: string; url?: string }) => Promise<void> };
    if (nav.share) { try { await nav.share({ title: "Book an appointment", url: bookingUrl }); return; } catch { /* fall through */ } }
    copyLink();
  };

  const next = () => { if (step < LAST) setStep(step + 1); else finish(); };
  const primaryLabel = step === 0 ? "Get started" : step === LAST ? "Finish" : "Continue";

  const headers: { tint: string; icon: React.ReactNode; title: string }[] = [
    { tint: "t1", title: "Your schedule, in your pocket", icon: Ic(<><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></>) },
    { tint: "t3", title: "Get a heads-up", icon: Ic(<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>) },
    { tint: "t2", title: "Share your booking link", icon: Ic(<><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" /></>) },
    { tint: "t1", title: "You're all set", icon: Ic(<><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-5" /></>) },
  ];
  const h = headers[step];

  return (
    <div className="mwt" role="dialog" aria-modal="true" aria-label="Set up the app">
      <button className="mwt-skip" onClick={finish}>Skip</button>
      <div className="mwt-body">
        <div className={`mwt-ic ${h.tint}`}>{h.icon}</div>
        <h2 className="mwt-title">{h.title}</h2>

        {step === 0 && <p className="mwt-text">Your hours and settings carry over from the dashboard. Two quick things to finish on your phone.</p>}

        {step === 1 && (
          <div className="msetup-form">
            <p className="mwt-text" style={{ marginBottom: 16 }}>Turn on alerts to get new bookings, changes and reminders pushed to this phone.</p>
            {pushSupported === false
              ? <p className="mwt-text" style={{ fontSize: 13.5 }}>To get alerts on iPhone, add this app to your Home Screen first, open it from there, then turn alerts on.</p>
              : pushOn
                ? <div className="mchip ok" style={{ fontSize: 13, padding: "8px 14px" }}>Alerts are on</div>
                : <button className="mbtn primary" disabled={pushBusy || pushSupported === null} onClick={enablePush}>{pushBusy ? "…" : "Turn on alerts"}</button>}
            {pushMsg && <div className={`mmsg ${pushMsg.ok ? "ok" : "err"}`} style={{ marginTop: 12 }}>{pushMsg.text}</div>}
          </div>
        )}

        {step === 2 && (
          <div className="msetup-form">
            <p className="mwt-text" style={{ marginBottom: 14 }}>Clients book you through this link. Put it in your bio, emails or signature.</p>
            <div className="msetup-link">{bookingUrl.replace(/^https?:\/\//, "")}</div>
            <div className="msetup-linkrow">
              <button className="mbtn primary" onClick={shareLink}>Share link</button>
              <button className="mbtn ghost" onClick={copyLink}>{copied ? "Copied" : "Copy"}</button>
            </div>
          </div>
        )}

        {step === 3 && <p className="mwt-text">You're ready to go. Manage your hours, alerts and more any time from the Me tab.</p>}
      </div>

      <div className="mwt-foot">
        <div className="mwt-dots" aria-hidden="true">{headers.map((_, n) => <span key={n} className={n === step ? "on" : ""} />)}</div>
        <div className="mwt-btns">
          {step > 0 && step !== LAST && <button className="mbtn ghost" onClick={() => setStep(step - 1)}>Back</button>}
          <button className="mbtn primary block" onClick={next}>{primaryLabel}</button>
        </div>
      </div>
    </div>
  );
}
