"use client";

import { useState } from "react";

interface Claimed { serviceName: string; clinicianName: string; whenText: string; manageUrl: string; }

export default function ClaimForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [taken, setTaken] = useState("");
  const [done, setDone] = useState<Claimed | null>(null);

  async function claim() {
    setBusy(true); setErr(""); setTaken("");
    try {
      const res = await fetch("/api/waitlist/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) { setDone({ serviceName: data.serviceName, clinicianName: data.clinicianName, whenText: data.whenText, manageUrl: data.manageUrl }); return; }
      if (res.status === 409) { setTaken(data.message || "Sorry, this time has already been taken."); return; }
      setErr(data.error || "Something went wrong. Please try again.");
    } catch { setErr("Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="bk-done">
        <div className="bk-check">✓</div>
        <h2 className="bk-h2">You&apos;re booked in! 🎉</h2>
        <p className="bk-donesub">This time is now yours. A confirmation with a calendar invite is on its way to your inbox.</p>
        <div className="bk-summary">
          <div className="bk-row"><span>Service</span><span>{done.serviceName}</span></div>
          <div className="bk-row"><span>Clinician</span><span>{done.clinicianName}</span></div>
          <div className="bk-row"><span>When</span><span>{done.whenText}</span></div>
        </div>
        <a className="bk-managelink" href={done.manageUrl}>Need to change it? Manage this booking →</a>
      </div>
    );
  }

  if (taken) {
    return (
      <div className="bk-done">
        <div className="bk-check" style={{ background: "linear-gradient(135deg,#8a929a,#6b7679)" }}>–</div>
        <h2 className="bk-h2">Just missed it</h2>
        <p className="bk-donesub">{taken}</p>
      </div>
    );
  }

  return (
    <>
      {err && <p className="bk-err">{err}</p>}
      <button className="bk-cta" onClick={claim} disabled={busy}>{busy ? "Confirming…" : "Claim this time"}</button>
      <p className="bk-tznote">First to confirm gets the spot. If it&apos;s taken, you&apos;ll keep your place on the waitlist.</p>
    </>
  );
}
