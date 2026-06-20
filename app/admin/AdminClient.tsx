"use client";

import { useState } from "react";

export interface ClinicianAdminInfo {
  id: string;
  name: string;
  email: string;
  hasLogin: boolean;
  submissionCount: number;
}

function initials(name: string): string {
  const words = name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter((w) => w && !/^(dr|mrs|mr|ms|miss)\.?$/i.test(w));
  return (words.slice(0, 2).map((w) => w[0]).join("") || name[0] || "?").toUpperCase();
}

export default function AdminClient({
  clinicians,
  adminKey,
}: {
  clinicians: ClinicianAdminInfo[];
  adminKey: string;
}) {
  return (
    <div>
      {clinicians.map((c) => (
        <ClinicianRow key={c.id} clinician={c} adminKey={adminKey} />
      ))}
    </div>
  );
}

function ClinicianRow({ clinician: c, adminKey }: { clinician: ClinicianAdminInfo; adminKey: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [hasLogin, setHasLogin] = useState(c.hasLogin);

  async function save() {
    setMsg(null);
    if (password.length < 8) {
      setMsg({ ok: false, text: "Password must be at least 8 characters." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminKey, clinicianId: c.id, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to set password.");
      setHasLogin(true);
      setPassword("");
      setMsg({ ok: true, text: "Password saved. Share it with the clinician securely." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="avatar" style={{ width: 42, height: 42, fontSize: 15, borderRadius: 12 }}>
          {initials(c.name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="sub-name">{c.name}</div>
          <div className="sub-meta">{c.email} · {c.submissionCount} submissions</div>
        </div>
        <span className={`badge ${hasLogin ? "badge-reviewed" : "badge-new"}`} style={{ marginLeft: "auto" }}>
          {hasLogin ? "Login active" : "No login yet"}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder={hasLogin ? "Set a new password (min 8 chars)" : "Set initial password (min 8 chars)"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <button className="primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : hasLogin ? "Reset password" : "Create login"}
        </button>
      </div>
      {msg && (
        <div className={msg.ok ? "msg-ok" : "auth-error"} style={{ marginTop: 12, marginBottom: 0 }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
