"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// A glowing "what's new" spotlight that shows for a person's first few sessions,
// then quietly retires. Count is per-browser (localStorage) and advances once per
// session (sessionStorage), so it appears the next N times they log in — not once
// per page. Dismissing hides it for good. Storage-blocked? It just doesn't show.
export default function FeatureSpotlight({ id, title, body, href, cta, times = 3 }: {
  id: string; title: string; body: string; href: string; cta: string; times?: number;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const countKey = `feat_${id}_count`;
      const count = Number(localStorage.getItem(countKey) || "0");
      if (count >= times) return;
      const sessKey = `feat_${id}_session`;
      if (!sessionStorage.getItem(sessKey)) {
        localStorage.setItem(countKey, String(count + 1));
        sessionStorage.setItem(sessKey, "1");
      }
      setShow(true);
    } catch { /* storage unavailable — skip the spotlight */ }
  }, [id, times]);

  const dismiss = () => {
    try { localStorage.setItem(`feat_${id}_count`, String(times)); } catch { /* ignore */ }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fs-spot" role="note">
      <div className="fs-inner">
        <span className="fs-badge">New</span>
        <div className="fs-txt">
          <div className="fs-title">{title}</div>
          <div className="fs-body">{body}</div>
        </div>
        <Link href={href} className="fs-cta" onClick={dismiss}>{cta} →</Link>
        <button type="button" className="fs-x" onClick={dismiss} aria-label="Dismiss">×</button>
      </div>
    </div>
  );
}
