"use client";

import { useState } from "react";

// Shows the clinician's private calendar-subscribe URL with one-tap add links.
export default function CalendarSubscribe({ url, embedded = false }: { url: string; embedded?: boolean }) {
  const [copied, setCopied] = useState(false);
  const webcal = url.replace(/^https?:/i, "webcal:");
  const googleAdd = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { /* clipboard blocked; the field is selectable */ }
  }

  return (
    <section className="calsub">
      {!embedded && (
        <>
          <h2 className="calsub-h">Subscribe to your calendar</h2>
          <p className="calsub-p">Add your TIFEC schedule to Apple Calendar, Google or Outlook. It stays in sync on its own. This link is private, so keep it to yourself.</p>
        </>
      )}
      <div className="calsub-row">
        <input className="calsub-url" value={url} readOnly onFocus={(e) => e.currentTarget.select()} aria-label="Calendar subscribe URL" />
        <button type="button" className="calsub-copy" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <div className="calsub-btns">
        <a className="calsub-btn" href={webcal}>Add to Apple Calendar / Outlook</a>
        <a className="calsub-btn" href={googleAdd} target="_blank" rel="noopener noreferrer">Add to Google Calendar</a>
      </div>
    </section>
  );
}
