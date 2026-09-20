"use client";

import { useState } from "react";

// Clinician manages which external calendars block their bookings.
export default function BusyFeeds({ initialFeeds, googleConnected }: { initialFeeds: string[]; googleConnected: boolean }) {
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
    <section className="calsub" style={{ marginTop: 16 }}>
      <h2 className="calsub-h">Block bookings over your other calendars</h2>
      <p className="calsub-p">Clients won&apos;t be offered a time when you&apos;re busy elsewhere.</p>

      <div className="bf-status">
        <span className={`bf-dot ${googleConnected ? "on" : ""}`} />
        {googleConnected
          ? <span>Your connected <b>Google Calendar</b> is blocking automatically.</span>
          : <span>Connect Google above to block over your Google Calendar automatically.</span>}
      </div>

      <p className="calsub-p" style={{ marginTop: 14, marginBottom: 8 }}>Add other calendars by their iCal (.ics) subscribe URL — e.g. your Outlook or a personal calendar&apos;s secret address:</p>
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
