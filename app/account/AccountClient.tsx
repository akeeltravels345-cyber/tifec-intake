"use client";

import { useState } from "react";

function PasswordField({
  id,
  label,
  autoComplete,
  value,
  onChange,
}: {
  id: string;
  label: string;
  autoComplete: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label className="q" htmlFor={id}>{label}</label>
      <div className="pw-wrap">
        <input
          id={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="pw-toggle" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide" : "Show"}>
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}

export default function AccountClient() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < 8;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next !== confirm) {
      setMsg({ ok: false, text: "New passwords do not match." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to update password.");
      setMsg({ ok: true, text: "Password updated successfully." });
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h2 className="section-title">Change password</h2>
      <p className="section-desc">Use at least 8 characters. You&apos;ll stay signed in after changing it.</p>

      {msg && <div className={msg.ok ? "msg-ok" : "auth-error"}>{msg.text}</div>}

      <PasswordField id="cur" label="Current password" autoComplete="current-password" value={current} onChange={setCurrent} />
      <PasswordField id="new" label="New password" autoComplete="new-password" value={next} onChange={setNext} />
      <PasswordField id="conf" label="Confirm new password" autoComplete="new-password" value={confirm} onChange={setConfirm} />

      {tooShort && <p className="error" style={{ marginTop: -6 }}>New password must be at least 8 characters.</p>}
      {mismatch && <p className="error" style={{ marginTop: -6 }}>Passwords don&apos;t match yet.</p>}

      <button
        className="primary"
        type="submit"
        disabled={busy || !current || next.length < 8 || next !== confirm}
        style={{ marginTop: 8 }}
      >
        {busy ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}
