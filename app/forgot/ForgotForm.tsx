"use client";

import { useState } from "react";

export default function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Something went wrong. Please try again.");
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="auth-form-inner">
        <h1 className="auth-heading">Check your email</h1>
        <p className="auth-subtle">
          If an account exists for <b>{email}</b>, we&apos;ve sent a link to reset your password. It expires in an hour — if it doesn&apos;t arrive, check your spam folder.
        </p>
        <p className="auth-foot"><a href="/login">← Back to sign in</a></p>
      </div>
    );
  }

  return (
    <form className="auth-form-inner" onSubmit={submit}>
      <h1 className="auth-heading">Reset your password</h1>
      <p className="auth-subtle">Enter your work email and we&apos;ll send you a link to set a new password.</p>

      {error && <div className="auth-error" role="alert">{error}</div>}

      <div className="field">
        <label className="q" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          placeholder="you@caymanessentialcare.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <button className="primary primary-lg" type="submit" disabled={busy} style={{ width: "100%", marginTop: 4 }}>
        {busy ? "Sending…" : "Send reset link"}
      </button>

      <p className="auth-foot"><a href="/login">← Back to sign in</a></p>
    </form>
  );
}
