"use client";

import { useState } from "react";

// Clinician manages which external calendars block their bookings.
// `embedded` hides the section's own heading/intro when it sits inside a flow
// (the setup wizard) that already explains what this does in plain words.
export default function BusyFeeds({ initialFeeds, googleConnected, embedded = false }: { initialFeeds: string[]; googleConnected: boolean; embedded?: boolean }) {
  const [feeds, setFeeds] = useState<string[]>(initialFeeds);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save(next: string[]) {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/scheduling/busy-feeds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feeds: next }) });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Could not save."); return; }
      setFeeds(data.feeds);
    } catch { setErr("Could not save."); }
    finally { setBusy(false); }
  }

  function add() {
    const u = url.trim();
    if (!/^(https?|webcal):\/\//i.test(u)) { setErr("Paste a calendar URL starting with http, https or webcal."); return; }
    setUrl("");
    save([...feeds, u]);
  }

  return (
    <section className="calsub" style={{ marginTop: embedded ? 0 : 16 }}>
      {!embedded && (
        <>
          <h2 className="calsub-h">Don’t get booked when you’re already busy</h2>
          <p className="calsub-p">If you keep your own calendar too, clients won’t be offered a time you’re already busy there.</p>
        </>
      )}

      <div className="bf-status">
        <span className={`bf-dot ${googleConnected ? "on" : ""}`} />
        {googleConnected
          ? <span>Done — we’re already checking your <b>Google Calendar</b>, so clients can’t book you over anything in it.</span>
          : <span>Tip: if you connect Google in the video step, we’ll check your Google Calendar automatically and you can skip the box below.</span>}
      </div>

      <p className="calsub-p" style={{ marginTop: 14, marginBottom: 8 }}>Use another calendar, like Outlook? Paste its private “subscribe” link (it ends in <b>.ics</b>) and we’ll avoid those times too:</p>
      {feeds.length > 0 && (
        <ul className="bf-list">
          {feeds.map((f) => (
            <li key={f} className="bf-item">
              <span className="bf-url" title={f}>{f}</span>
              <button type="button" className="bf-x" disabled={busy} onClick={() => save(feeds.filter((x) => x !== f))}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <div className="calsub-row">
        <input className="calsub-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/basic.ics" aria-label="iCal feed URL" onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <button type="button" className="calsub-copy" disabled={busy} onClick={add}>{busy ? "Saving…" : "Add"}</button>
      </div>
      {err && <p className="bf-err">{err}</p>}
    </section>
  );
}
