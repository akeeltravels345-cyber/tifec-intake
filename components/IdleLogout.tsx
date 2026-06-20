"use client";

import { useEffect } from "react";

// Automatic logoff: signs the clinician out after a period of inactivity, so an
// unattended screen doesn't leave client data exposed. Mounted on authenticated
// pages only (never on the public client-facing intake form).
export default function IdleLogout({ minutes = 15 }: { minutes?: number }) {
  useEffect(() => {
    const ms = minutes * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;

    async function signOut() {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {
        /* ignore - redirect anyway */
      }
      window.location.href = "/login?timeout=1";
    }

    function reset() {
      clearTimeout(timer);
      timer = setTimeout(signOut, ms);
    }

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes]);

  return null;
}
