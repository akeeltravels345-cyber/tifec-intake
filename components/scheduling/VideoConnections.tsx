"use client";

import { useState } from "react";

type Provider = "zoom" | "google";
interface Conn { provider: Provider; accountEmail: string; preferred: boolean }
const LABEL: Record<Provider, string> = { zoom: "Zoom", google: "Google Meet" };
const BLURB: Record<Provider, string> = {
  zoom: "Your virtual sessions get a Zoom link created on your own Zoom account.",
  google: "Your virtual sessions get a Google Meet link created on your own Google Calendar.",
};

export default function VideoConnections({ initial, configured, notice }: {
  initial: Conn[]; configured: { zoom: boolean; google: boolean }; notice: { connected: string; error: string };
}) {
  const [conns, setConns] = useState<Conn[]>(initial);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(notice.error ? notice.error : notice.connected ? `Connected ${LABEL[notice.connected as Provider] || notice.connected}.` : "");
  const [isErr, setIsErr] = useState(!!notice.error);

  const byProvider = (p: Provider) => conns.find((c) => c.provider === p) || null;
  const both = conns.length > 1;

  async function act(action: "prefer" | "disconnect", provider: Provider) {
    setBusy(provider + action); setMsg(""); setIsErr(false);
    const res = await fetch("/api/scheduling/video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, provider }) });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) { setMsg(data.error || "Something went wrong."); setIsErr(true); return; }
    setConns(data.connections || []);
    if (action === "disconnect") { setMsg(`Disconnected ${LABEL[provider]}.`); }
  }

  const Card = ({ p }: { p: Provider }) => {
    const conn = byProvider(p);
    const ok = configured[p];
    return (
      <div className={`vc-card ${conn ? "on" : ""}`}>
        <div className="vc-cardhead">
          <div className="vc-name">{LABEL[p]}</div>
          {conn && <span className="vc-badge">Connected</span>}
        </div>
        <p className="vc-blurb">{BLURB[p]}</p>
        {conn ? (
          <>
            {conn.accountEmail && <div className="vc-acct">{conn.accountEmail}</div>}
            <div className="vc-row">
              {both && (
                <label className="vc-default"><input type="radio" name="preferred" checked={conn.preferred} onChange={() => act("prefer", p)} /> Default for my virtual sessions</label>
              )}
              <span className="vc-sp" />
              <button className="vc-btn" disabled={busy === p + "disconnect"} onClick={() => act("disconnect", p)}>{busy === p + "disconnect" ? "…" : "Disconnect"}</button>
            </div>
          </>
        ) : ok ? (
          <a className="vc-connect" href={`/api/scheduling/video/connect?provider=${p}`}>Connect {LABEL[p]}</a>
        ) : (
          <div className="vc-unavail">Not set up on the server yet. Ask the admin to add the {LABEL[p]} app credentials.</div>
        )}
      </div>
    );
  };

  return (
    <div className="vc">
      <div className="vc-head">
        <h1 className="vc-h1">Video connections</h1>
        <p className="vc-sub">Connect your own Zoom or Google Meet so virtual appointments get a meeting link automatically. Only you use these, and they stay on your account.</p>
      </div>
      {msg && <p className={`vc-msg ${isErr ? "err" : "ok"}`}>{msg}</p>}
      <div className="vc-cards">
        <Card p="zoom" />
        <Card p="google" />
      </div>
      {both && <p className="vc-hint">You have both connected. The one marked <b>Default</b> is used for your virtual sessions.</p>}
    </div>
  );
}
