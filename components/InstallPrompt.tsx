"use client";

import { useEffect, useState } from "react";

// A small, dismissible "add this to your home screen" helper for the scheduling
// app. It only shows when the app is opened in a browser (not already installed)
// and the viewer hasn't dismissed it. On Android/Chrome it offers a one-tap
// Install button (the captured beforeinstallprompt); on iPhone Safari — which
// has no install API — it shows the Share -> Add to Home Screen steps.
type BipEvent = Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "tifec-install-dismissed";

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferred, setDeferred] = useState<BipEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    // Already installed (opened from the home-screen icon)? Then never show it.
    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    try { if (localStorage.getItem(DISMISS_KEY) === "1") return; } catch { /* storage blocked */ }

    const ua = navigator.userAgent || "";
    const isIosSafari = /iphone|ipad|ipod/i.test(ua) && !/crios|fxios|edgios/i.test(ua);

    const onBip = (e: Event) => {
      e.preventDefault(); // stop Chrome's mini-infobar; we show our own
      setDeferred(e as BipEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    // iOS gives no install event, so show the manual steps there.
    if (isIosSafari) { setIos(true); setShow(true); }
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* storage blocked */ }
    setShow(false);
  };
  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* ignore */ }
    setDeferred(null);
    setShow(false);
  };

  return (
    <div className="installbar" role="dialog" aria-label="Add Schedule to your home screen">
      <div className="installbar-icon" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" width={34} height={34} />
      </div>
      <div className="installbar-text">
        <strong>Add Schedule to your home screen</strong>
        {ios ? (
          <span>
            Tap the Share icon{" "}
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: "-2px" }}>
              <path d="M12 16V4M8 8l4-4 4 4" /><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
            </svg>
            , then <b>Add to Home Screen</b>.
          </span>
        ) : (
          <span>Install it to open straight from your phone, like an app.</span>
        )}
      </div>
      <div className="installbar-actions">
        {!ios && deferred && <button type="button" className="installbar-go" onClick={install}>Install</button>}
        <button type="button" className="installbar-x" onClick={dismiss} aria-label="Dismiss">✕</button>
      </div>
    </div>
  );
}
