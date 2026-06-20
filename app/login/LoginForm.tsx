"use client";

import { useState } from "react";

export default function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Login failed.");
      }
      window.location.href = next || "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
      setBusy(false);
    }
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

      <p className="auth-foot">Forgot your password? Contact your practice admin.</p>
    </form>
  );
}
