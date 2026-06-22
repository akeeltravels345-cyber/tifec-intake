"use client";

import { useState } from "react";

// Share controls for the public wellbeing self-check (link + QR). Nothing comes
// back to the clinician; this is for talks, workshops, or one-off sharing.
export default function ScreeningShare() {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const url = (typeof window !== "undefined" ? window.location.origin : "") + "/screening";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div>
      <div className="form-actions">
        <button className="primary" onClick={copy} style={{ padding: "9px 18px" }}>
          {copied ? "Copied ✓" : "Copy link"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setShowQr((v) => !v)}>
          {showQr ? "Hide QR code" : "Show QR code"}
        </button>
        <a href="/screening" target="_blank" rel="noreferrer">
          <button type="button" className="btn-ghost">Open ↗</button>
        </a>
      </div>
      {showQr && (
        <div className="screening-qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/screening-qr.png" alt="QR code linking to the wellbeing self-check" width={190} height={190} />
          <div className="screening-qr-url">{url}</div>
          <a href="/screening-qr.png" download="tifec-wellbeing-qr.png" className="btn-ghost screening-qr-dl">
            Download QR for slides
          </a>
        </div>
      )}
    </div>
  );
}
