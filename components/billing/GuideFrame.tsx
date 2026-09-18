"use client";

import { useEffect, useRef, useState } from "react";

// Embeds the standalone biller handbook (served from /biller-handbook.html).
// It fills the viewport and scrolls internally by default (always reliable), and
// if the handbook reports its full height via postMessage we grow to fit it so
// the whole doc flows in the page with no inner scrollbar.
export default function GuideFrame() {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<string>("calc(100vh - 108px)");

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; height?: number } | null;
      if (d && d.type === "bhb-height" && typeof d.height === "number" && d.height > 200) setHeight(`${d.height + 8}px`);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  return (
    <iframe
      ref={ref}
      src="/biller-handbook.html"
      title="Biller handbook"
      style={{ width: "100%", height, border: 0, display: "block", background: "transparent" }}
    />
  );
}
