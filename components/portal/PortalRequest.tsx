"use client";

import { useState } from "react";

export default function PortalRequest() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setErr("Please enter a valid email."); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/portal/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }) });
      if (res.ok) setSent(true);
      else { const d = await res.json().catch(() => ({})); setErr(d.error || "Something went wrong. Please try again."); }
    } catch { setErr("Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }

  if (sent) {
    return (
      <div>
        <div className="pt-check">✓</div>
        <p className="pt-hi" style={{ marginTop: 0 }}>If we have appointments for <b>{email.trim()}</b>, we&apos;ve emailed you a secure link to view and manage them. It can take a minute to arrive.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="pt-lead">Enter the email you booked with and we&apos;ll send you a secure link to see your appointments, complete any intake, and reschedule or cancel.</p>
      <div className="pt-field">
        <label className="pt-flabel" htmlFor="pt-email">Email</label>
        <input id="pt-email" className="pt-input" type="email" value={email} autoFocus placeholder="you@example.com"
          onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
      </div>
      {err && <p className="pt-err">{err}</p>}
      <button className="pt-cta" onClick={submit} disabled={busy}>{busy ? "Sending…" : "Email me my link"}</button>
    </div>
  );
}
