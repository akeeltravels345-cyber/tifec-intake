"use client";

import { useState } from "react";

export default function ShareLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      const url = (typeof window !== "undefined" ? window.location.origin : "") + path;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="form-actions">
      <button className="primary" onClick={copy} style={{ padding: "9px 18px" }}>
        {copied ? "Copied ✓" : "Copy link"}
      </button>
      <a href={`${path}&preview=1`} target="_blank" rel="noreferrer">
        <button type="button" className="btn-ghost">Preview ↗</button>
      </a>
    </div>
  );
}
