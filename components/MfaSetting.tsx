"use client";

import { useState } from "react";

type View = "idle" | "setup" | "codes";

export default function MfaSetting({
  initialEnabled,
  initialBackupRemaining,
}: {
  initialEnabled: boolean;
  initialBackupRemaining: number;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [backupRemaining, setBackupRemaining] = useState(initialBackupRemaining);
  const [view, setView] = useState<View>("idle");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // setup state
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  // turn-off state
  const [showOff, setShowOff] = useState(false);
  const [offCode, setOffCode] = useState("");
  const [offPassword, setOffPassword] = useState("");

  async function post(payload: Record<string, unknown>) {
    const res = await fetch("/api/account/mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(b.error || "Something went wrong.");
    return b;
  }

  async function start() {
    setErr(null); setBusy(true);
    try {
      const b = await post({ action: "start" });
      setQr(b.qr || ""); setSecret(b.secret || ""); setCode("");
      setView("setup");
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  async function confirmEnable(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const b = await post({ action: "enable", code });
      setBackupCodes(b.backupCodes || []);
      setEnabled(true);
      setBackupRemaining((b.backupCodes || []).length);
      setView("codes");
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  async function turnOff(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await post({ action: "disable", code: offCode, password: offPassword });
      setEnabled(false); setShowOff(false); setOffCode(""); setOffPassword("");
      setView("idle");
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  function copyCodes() {
    try { navigator.clipboard.writeText(backupCodes.join("\n")); } catch { /* ignore */ }
  }

  return (
    <div>
      <h2 className="section-title">
        Two-step login
        <span
          style={{
            marginLeft: 10, fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: 999,
            background: enabled ? "var(--ec-ok-bg,#e6f5ee)" : "var(--line,#e4eaed)",
            color: enabled ? "var(--ec-ok,#1f8a5b)" : "var(--muted,#5f6b75)",
            verticalAlign: "middle",
          }}
        >
          {enabled ? "On" : "Off"}
        </span>
      </h2>
      <p className="section-desc" style={{ marginBottom: 14 }}>
        Adds a second step at sign-in: a one-time 6-digit code from an authenticator app on your phone
        (Google Authenticator, Microsoft Authenticator, 1Password, Authy…). Even if someone learns your
        password, they can&apos;t get in without your phone.
      </p>

      {err && <div className="auth-error" style={{ marginBottom: 12 }}>{err}</div>}

      {/* ---------- OFF: invite to turn on ---------- */}
      {!enabled && view === "idle" && (
        <button className="primary" type="button" onClick={start} disabled={busy}>
          {busy ? "Preparing…" : "Turn on two-step login"}
        </button>
      )}

      {/* ---------- SETUP: scan + confirm ---------- */}
      {!enabled && view === "setup" && (
        <form onSubmit={confirmEnable}>
          <ol style={{ margin: "0 0 14px", paddingLeft: 20, lineHeight: 1.7 }}>
            <li>Open your authenticator app and choose <b>add / scan QR code</b>.</li>
            <li>Scan the code below (or type the key).</li>
            <li>Enter the 6-digit code it shows, to confirm.</li>
          </ol>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
            {qr
              ? /* eslint-disable-next-line @next/next/no-img-element */
                <img src={qr} alt="Two-step login QR code" width={200} height={200} style={{ border: "1px solid var(--line,#e4eaed)", borderRadius: 10, background: "#fff" }} />
              : <div className="section-desc">QR unavailable. Use the key below.</div>}
            <div>
              <div className="section-desc" style={{ marginBottom: 4 }}>Can&apos;t scan? Type this key into the app:</div>
              <code style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.08em", wordBreak: "break-all", display: "block", padding: "8px 10px", background: "var(--raise,#f6f8f9)", borderRadius: 8 }}>{secret}</code>
            </div>
          </div>
          <div className="field">
            <label className="q" htmlFor="mfa-confirm">6-digit code from the app</label>
            <input
              id="mfa-confirm" inputMode="numeric" autoComplete="one-time-code" placeholder="123456"
              value={code} onChange={(e) => setCode(e.target.value)} autoFocus
              style={{ letterSpacing: "0.3em", fontSize: 18, maxWidth: 200 }}
            />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button className="primary" type="submit" disabled={busy || code.trim().length < 6}>
              {busy ? "Confirming…" : "Confirm and turn on"}
            </button>
            <button type="button" className="ghost" onClick={() => { setView("idle"); setErr(null); }}>Cancel</button>
          </div>
        </form>
      )}

      {/* ---------- CODES: show backup codes once ---------- */}
      {view === "codes" && (
        <div>
          <div className="msg-ok" style={{ marginBottom: 12 }}>Two-step login is on. 🎉</div>
          <p className="section-desc" style={{ marginBottom: 10 }}>
            <b>Save these backup codes somewhere safe</b> (a password manager, or printed and locked away).
            Each one works once if you ever lose your phone. This is the only time they&apos;re shown.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 6, maxWidth: 320, margin: "0 0 12px" }}>
            {backupCodes.map((c) => (
              <code key={c} style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.06em", padding: "6px 8px", background: "var(--raise,#f6f8f9)", borderRadius: 8, textAlign: "center" }}>{c}</code>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="primary" onClick={() => setView("idle")}>I&apos;ve saved them</button>
            <button type="button" className="ghost" onClick={copyCodes}>Copy codes</button>
          </div>
        </div>
      )}

      {/* ---------- ON: status + turn off ---------- */}
      {enabled && view === "idle" && (
        <div>
          <p className="section-desc" style={{ marginBottom: 12 }}>
            Two-step login is on for your account.{" "}
            {backupRemaining > 0
              ? <>You have <b>{backupRemaining}</b> backup code{backupRemaining === 1 ? "" : "s"} left.</>
              : <>You have no backup codes left. Turn two-step off and on again to get a fresh set.</>}
          </p>
          {!showOff ? (
            <button type="button" className="ghost" onClick={() => { setShowOff(true); setErr(null); }}>Turn off two-step login</button>
          ) : (
            <form onSubmit={turnOff} style={{ borderTop: "1px solid var(--line,#e4eaed)", paddingTop: 12 }}>
              <p className="section-desc" style={{ marginBottom: 8 }}>To turn it off, enter a current code from your app <i>or</i> your password.</p>
              <div className="field">
                <label className="q" htmlFor="off-code">Current 6-digit code</label>
                <input id="off-code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={offCode} onChange={(e) => setOffCode(e.target.value)} style={{ letterSpacing: "0.3em", maxWidth: 200 }} />
              </div>
              <div className="field">
                <label className="q" htmlFor="off-pw">…or your password</label>
                <input id="off-pw" type="password" autoComplete="current-password" placeholder="Your password" value={offPassword} onChange={(e) => setOffPassword(e.target.value)} style={{ maxWidth: 260 }} />
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <button type="submit" className="primary" disabled={busy || (!offCode.trim() && !offPassword)}>{busy ? "Turning off…" : "Confirm turn off"}</button>
                <button type="button" className="ghost" onClick={() => { setShowOff(false); setOffCode(""); setOffPassword(""); setErr(null); }}>Keep it on</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
