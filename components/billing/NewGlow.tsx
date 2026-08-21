"use client";

import { useEffect, useState } from "react";

// Wraps an entry point (a KPI card, a nav link) and makes it glow for a person's
// first few sessions, so they can find where a new feature lives. Uses
// display:contents so it never disturbs the surrounding layout; the glow is an
// inset ring (safe inside overflow-clipped grids). Count is per-browser and
// advances once per session, like the Today spotlight.
export default function NewGlow({ id, children, times = 3 }: { id: string; children: React.ReactNode; times?: number }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    try {
      const countKey = `glow_${id}_count`;
      const count = Number(localStorage.getItem(countKey) || "0");
      if (count >= times) return;
      const sessKey = `glow_${id}_session`;
      if (!sessionStorage.getItem(sessKey)) {
        localStorage.setItem(countKey, String(count + 1));
        sessionStorage.setItem(sessKey, "1");
      }
      setOn(true);
    } catch { /* storage unavailable — no glow */ }
  }, [id, times]);

  return <span className={`ng ${on ? "on" : ""}`}>{children}</span>;
}
