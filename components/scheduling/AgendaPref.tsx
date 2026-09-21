"use client";

import { useState } from "react";

export default function AgendaPref({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !on;
    setOn(next); setBusy(true); // optimistic
    try {
      const res = await fetch("/api/scheduling/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dailyAgenda: next }) });
      if (!res.ok) setOn(!next); // revert on failure
    } catch { setOn(!next); }
    finally { setBusy(false); }
  }

  return (
    <div className="ap-card">
      <div className="ap-head"><h2>Daily agenda email</h2></div>
      <div className="ap-row">
        <div className="ap-copy">
          <b>Morning agenda</b>
          <span>Get an email each morning listing your appointments for the day. Turn it off if you&apos;d rather not.</span>
        </div>
        <button type="button" role="switch" aria-checked={on} className={`ap-switch${on ? " on" : ""}`} disabled={busy} onClick={toggle}>
          <span className="ap-knob" />
        </button>
      </div>
      <p className="ap-note">{on ? "On — you'll get your agenda each morning." : "Off — no daily agenda email."}</p>
    </div>
  );
}
