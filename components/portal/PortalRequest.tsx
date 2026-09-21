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
      <div className="bk-done">
        <div className="bk-check">✓</div>
        <h2 className="bk-h2">Check your inbox</h2>
        <p className="bk-donesub">If we have appointments for <b>{email.trim()}</b>, we&apos;ve emailed you a secure link to view and manage them. It can take a minute to arrive.</p>
      </div>
    );
  }

  return (
    <>
      <h2 className="bk-h2">Your appointments</h2>
      <p className="bk-donesub">Enter the email you booked with and we&apos;ll send you a secure link to see your appointments, complete any intake, and reschedule or cancel.</p>
      <div className="bk-form" style={{ marginTop: 14 }}>
        <label className="bk-f"><span>Email</span>
          <input type="email" value={email} autoFocus onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="you@example.com" />
        </label>
      </div>
      {err && <p className="bk-err">{err}</p>}
      <button className="bk-cta" onClick={submit} disabled={busy}>{busy ? "Sending…" : "Email me my link"}</button>
    </>
  );
}
