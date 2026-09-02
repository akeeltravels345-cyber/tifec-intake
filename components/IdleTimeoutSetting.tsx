"use client";

import { useState } from "react";

// Lets a user choose how long the app waits before signing them out on
// inactivity. Capped set (never "off") so the automatic-logoff safeguard stays.
export default function IdleTimeoutSetting({ initial, choices }: { initial: number; choices: number[] }) {
  const [minutes, setMinutes] = useState(initial);
  const [saved, setSaved] = useState<number | null>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function pick(m: number) {
    if (m === minutes && m === saved) return;
    setMinutes(m); setBusy(true); setErr("");
    try {
      const res = await fetch("/api/account/idle", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minutes: m }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Could not save."); return; }
      setSaved(m);
    } catch { setErr("Could not reach the server."); }
    finally { setBusy(false); }
  }

  return (
    <div className="idle-set">
      <h2 className="idle-h">Auto sign-out</h2>
      <p className="idle-sub">
        For security, the app signs you out after a period of no activity. Pick how long to wait. This is a HIPAA
        safeguard, so it can be lengthened but not turned off.
      </p>
      <div className="idle-opts">
        {choices.map((m) => (
          <button
            key={m} type="button" disabled={busy}
            className={`idle-opt ${minutes === m ? "on" : ""}`}
            onClick={() => pick(m)}
          >
            {m} min
          </button>
        ))}
      </div>
      {err ? <p className="idle-err">{err}</p>
        : saved != null && <p className="idle-ok">Signed out after <b>{saved} minutes</b> of inactivity.</p>}
    </div>
  );
}
