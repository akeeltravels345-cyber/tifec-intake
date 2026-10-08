"use client";

import { useState } from "react";

export default function ResetForm({ token }: { token: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (pw !== pw2) { setError("Those passwords don't match."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: pw }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error || "Could not reset your password.");
      setDone(true);
      setTimeout(() => { window.location.href = "/today"; }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset your password.");
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="auth-form-inner">
        <h1 className="auth-heading">Invalid link</h1>
        <p className="auth-subtle">This reset link is missing or malformed. <a href="/forgot">Request a new one</a>.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="auth-form-inner">
        <h1 className="auth-heading">Password updated ✓</h1>
        <p className="auth-subtle">You&apos;re all set — signing you in…</p>
      </div>
    );
  }

  return (
    <form className="auth-form-inner" onSubmit={submit}>
      <h1 className="auth-heading">Choose a new password</h1>
      <p className="auth-subtle">At least 8 characters. You&apos;ll be signed in automatically once it&apos;s set.</p>

      {error && <div className="auth-error" role="alert">{error}</div>}

      <div className="field">
        <label className="q" htmlFor="pw">New password</label>
        <div className="pw-wrap">
          <input id="pw" type={show ? "text" : "password"} autoComplete="new-password" placeholder="At least 8 characters" value={pw} onChange={(e) => setPw(e.target.value)} required />
          <button type="button" className="pw-toggle" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>{show ? "Hide" : "Show"}</button>
        </div>
      </div>

      <div className="field">
        <label className="q" htmlFor="pw2">Confirm password</label>
        <input id="pw2" type={show ? "text" : "password"} autoComplete="new-password" placeholder="Re-enter it" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
      </div>

      <button className="primary primary-lg" type="submit" disabled={busy} style={{ width: "100%", marginTop: 4 }}>
        {busy ? "Saving…" : "Set new password"}
      </button>

      <p className="auth-foot"><a href="/login">← Back to sign in</a></p>
    </form>
  );
}
