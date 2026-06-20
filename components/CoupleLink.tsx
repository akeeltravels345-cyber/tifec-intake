"use client";

import { useState } from "react";

function newCoupleId(): string {
  const raw =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return raw.replace(/[^a-z0-9]/gi, "").slice(0, 12);
}

export default function CoupleLink({ clinicianId }: { clinicianId: string }) {
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const path = coupleId ? `/intake?clinician=${clinicianId}&couple=${coupleId}` : "";
  const url = coupleId && typeof window !== "undefined" ? window.location.origin + path : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* selectable fallback */
    }
  }

  if (!coupleId) {
    return (
      <div className="form-actions">
        <button className="primary" onClick={() => setCoupleId(newCoupleId())} style={{ padding: "9px 18px" }}>
          Start a couple
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="form-card-hint" style={{ marginTop: 0 }}>
        Send this <strong>same link</strong> to both partners. Each completes their own form and
        they&apos;ll be linked.
      </p>
      <div className="form-actions">
        <button className="primary" onClick={copy} style={{ padding: "9px 18px" }}>
          {copied ? "Copied ✓" : "Copy couple link"}
        </button>
        <a href={`${path}&preview=1`} target="_blank" rel="noreferrer">
          <button type="button" className="btn-ghost">Preview ↗</button>
        </a>
        <button
          type="button"
          className="dash-clear-filter"
          onClick={() => { setCoupleId(newCoupleId()); setCopied(false); }}
        >
          + New couple
        </button>
      </div>
    </div>
  );
}
