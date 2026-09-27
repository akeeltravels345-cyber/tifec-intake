"use client";

import { useEffect } from "react";

// Registers the service worker so the app is installable to the home screen.
// Fails silently where service workers aren't available (older browsers,
// private windows) — the app works exactly the same without it.
export default function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onLoad = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
  }, []);
  return null;
}
