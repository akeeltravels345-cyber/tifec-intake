"use client";

import { useState } from "react";

export default function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Two-step login: once the password is accepted for an MFA account, we switch
  // this form to collect the one-time code instead of navigating away.
  const [stage, setStage] = useState<"password" | "code">("password");
  const [code, setCode] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error || "Login failed.");
      if (b.mfa) {
        // Second factor required, show the code step.
        setStage("code");
        setBusy(false);
        return;
      }
      window.location.href = next || "/today";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error || "That code wasn't right.");
      window.location.href = next || "/today";
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code wasn't right.");
      setBusy(false);
    }
  }

  if (stage === "code") {
    return (
      <form className="auth-form-inner" onSubmit={submitCode}>
        <h1 className="auth-heading">Two-step verification</h1>
        <p className="auth-subtle">Open your authenticator app and enter the current 6-digit code for Cayman Essential Care. You can also enter one of your backup codes.</p>

        {error && <div className="auth-error" role="alert">{error}</div>}

        <div className="field">
          <label className="q" htmlFor="code">6-digit code</label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            required
            style={{ letterSpacing: "0.3em", fontSize: 18 }}
          />
        </div>

        <button className="primary primary-lg" type="submit" disabled={busy || code.trim().length < 6} style={{ width: "100%", marginTop: 4 }}>
          {busy ? "Verifying…" : "Verify and sign in"}
        </button>

        <p className="auth-foot">
          <a href="#" onClick={(e) => { e.preventDefault(); setStage("password"); setCode(""); setError(null); }}>Start over</a>
        </p>
      </form>
    );
  }

  return (
    <form className="auth-form-inner" onSubmit={submit}>
      <h1 className="auth-heading">Welcome back</h1>
      <p className="auth-subtle">Sign in to your TIFEC clinician dashboard.</p>

      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}

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

      <div className="field">
        <label className="q" htmlFor="password">Password</label>
        <div className="pw-wrap">
          <input
            id="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            className="pw-toggle"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <button className="primary primary-lg" type="submit" disabled={busy} style={{ width: "100%", marginTop: 4 }}>
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <p className="auth-foot"><a href="/forgot">Forgot your password?</a></p>
    </form>
  );
}
