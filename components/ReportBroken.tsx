"use client";

import { useEffect, useRef } from "react";

// Fires a one-shot report to /api/report when a broken (404) or crashing page
// renders, so the team is told automatically. Renders nothing.
export default function ReportBroken({ kind, message }: { kind: "404" | "error"; message?: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const path = window.location.pathname + window.location.search;
    fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: kind === "error" ? "error" : "404", path, message }),
      keepalive: true,
    }).catch(() => {});
  }, [kind, message]);
  return null;
}
