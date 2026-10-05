"use client";

import { useState } from "react";

export default function AgendaPref({ dailyAgenda, newBookings }: { dailyAgenda: boolean; newBookings: boolean }) {
  const [agenda, setAgenda] = useState(dailyAgenda);
  const [bookings, setBookings] = useState(newBookings);
  const [busy, setBusy] = useState(false);

  async function toggle(key: "dailyAgenda" | "newBookings") {
    const cur = key === "dailyAgenda" ? agenda : bookings;
    const set = key === "dailyAgenda" ? setAgenda : setBookings;
    const next = !cur;
    set(next); setBusy(true); // optimistic
    try {
      const res = await fetch("/api/scheduling/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: next }) });
      if (!res.ok) set(!next); // revert on failure
    } catch { set(!next); }
    finally { setBusy(false); }
  }

  return (
    <div className="ap-card">
      <div className="ap-head"><h2>Email summaries</h2></div>
      <div className="ap-row">
        <div className="ap-copy">
          <b>Morning agenda</b>
          <span>An email each morning listing your appointments for the day.</span>
        </div>
        <button type="button" role="switch" aria-checked={agenda} className={`ap-switch${agenda ? " on" : ""}`} disabled={busy} onClick={() => toggle("dailyAgenda")}>
          <span className="ap-knob" />
        </button>
      </div>
      <div className="ap-row">
        <div className="ap-copy">
          <b>New bookings recap</b>
          <span>An email at the end of each day summarising every new appointment booked with you that day.</span>
        </div>
        <button type="button" role="switch" aria-checked={bookings} className={`ap-switch${bookings ? " on" : ""}`} disabled={busy} onClick={() => toggle("newBookings")}>
          <span className="ap-knob" />
        </button>
      </div>
      <p className="ap-note">Sent only on days with something to report. Times are Cayman time.</p>
    </div>
  );
}
