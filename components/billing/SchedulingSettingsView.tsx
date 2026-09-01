"use client";

import { useState } from "react";
import type { SchedulingSettings } from "@/lib/scheduling";

const ACCENTS = ["#256e72", "#2f8e93", "#2e3192", "#3f8f5f", "#7a4fa3", "#b1543c", "#c2841d"];
const sample = { client: "Ada Rivers", service: "Individual therapy", clinician: "Dr. Shion O'Connor", when: "Mon, 8 Sep at 10:00 AM", practice: "Cayman Essential Care" };
const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => (sample as Record<string, string>)[k] ?? `{${k}}`);

export default function SchedulingSettingsView({ initial }: { initial: SchedulingSettings }) {
  const [s, setS] = useState<SchedulingSettings>(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const setBooking = (patch: Partial<SchedulingSettings["booking"]>) => { setS((x) => ({ ...x, booking: { ...x.booking, ...patch } })); setDirty(true); setMsg(""); };
  const setBridge = (patch: Partial<SchedulingSettings["bridge"]>) => { setS((x) => ({ ...x, bridge: { ...x.bridge, ...patch } })); setDirty(true); setMsg(""); };
  const setNotif = (patch: Partial<SchedulingSettings["notifications"]>) => { setS((x) => ({ ...x, notifications: { ...x.notifications, ...patch } })); setDirty(true); setMsg(""); };
  const setTpl = (which: "confirmation" | "reminder", patch: Partial<SchedulingSettings["notifications"]["templates"]["confirmation"]>) =>
    setNotif({ templates: { ...s.notifications.templates, [which]: { ...s.notifications.templates[which], ...patch } } });

  async function save() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/scheduling/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { setS(data.settings); setDirty(false); setMsg("Saved."); } else setMsg(data.error || "Could not save.");
  }
  const n = s.notifications;

  return (
    <div className="ss">
      <div className="ss-head"><div><h1 className="ss-h1">Settings</h1><p className="ss-sub">Your booking page and the notifications clients would get.</p></div></div>

      <div className="ss-card">
        <h2>Booking page</h2>
        <label className="ss-f"><span>Welcome message <em>(shown under the title)</em></span>
          <textarea rows={2} value={s.booking.welcome} onChange={(e) => setBooking({ welcome: e.target.value })} placeholder="e.g. We're glad you're here. Pick a time that works for you." /></label>
        <div className="ss-f"><span>Accent colour</span>
          <div className="ss-swatches">{ACCENTS.map((c) => <button key={c} type="button" className={`ss-sw ${s.booking.accent === c ? "on" : ""}`} style={{ background: c }} onClick={() => setBooking({ accent: c })} aria-label={c} />)}</div>
        </div>
      </div>

      <div className="ss-card">
        <div className="ss-notihead">
          <h2>Notifications</h2>
          <label className="ss-switch"><input type="checkbox" checked={n.enabled} onChange={(e) => setNotif({ enabled: e.target.checked })} /> <span>{n.enabled ? "On" : "Off"}</span></label>
        </div>
        {!n.enabled && <p className="ss-warn">Off. Nothing is sent to clients yet. Turn this on (and give the go-ahead) when you're ready to start sending.</p>}
        <div className="ss-toggles">
          {([["confirmation", "Booking confirmation"], ["reminder", "Reminders"], ["reschedule", "Reschedule notice"], ["cancellation", "Cancellation notice"]] as const).map(([k, label]) => (
            <label key={k} className="ss-chk"><input type="checkbox" checked={n[k]} onChange={(e) => setNotif({ [k]: e.target.checked } as never)} /> {label}</label>
          ))}
        </div>
        <label className="ss-f"><span>Reminder timing <em>(hours before, comma-separated)</em></span>
          <input value={n.reminderOffsetsHours.join(", ")} onChange={(e) => setNotif({ reminderOffsetsHours: e.target.value.split(",").map((x) => parseInt(x.trim(), 10)).filter((x) => x > 0) })} placeholder="24, 1" /></label>
      </div>

      <div className="ss-card">
        <h2>Templates</h2>
        <p className="ss-hint">Placeholders: {"{client} {service} {clinician} {when} {practice}"}</p>
        {(["confirmation", "reminder"] as const).map((k) => (
          <div key={k} className="ss-tpl">
            <div className="ss-tpl-name">{k === "confirmation" ? "Confirmation" : "Reminder"}</div>
            <label className="ss-f"><span>Subject</span><input value={n.templates[k].subject} onChange={(e) => setTpl(k, { subject: e.target.value })} /></label>
            <label className="ss-f"><span>Body</span><textarea rows={4} value={n.templates[k].body} onChange={(e) => setTpl(k, { body: e.target.value })} /></label>
            <div className="ss-preview"><div className="ss-preview-l">Preview</div><div className="ss-preview-s">{fill(n.templates[k].subject)}</div><div className="ss-preview-b">{fill(n.templates[k].body)}</div></div>
          </div>
        ))}
      </div>

      <div className="ss-card">
        <div className="ss-notihead">
          <h2>Connect to billing</h2>
          <label className="ss-switch"><input type="checkbox" checked={s.bridge.seenToBilling} onChange={(e) => setBridge({ seenToBilling: e.target.checked })} /> <span>{s.bridge.seenToBilling ? "On" : "Off"}</span></label>
        </div>
        {s.bridge.seenToBilling
          ? <p className="ss-warn" style={{ color: "#226e72", background: "var(--teal-bg, #e2efef)" }}>On. Marking an appointment <b>seen</b> now creates a billing session (clinician, date, baseline codes, insurer) for the biller to work. Each visit is bridged once.</p>
          : <p className="ss-warn">Off. Marking an appointment seen does nothing to billing yet. Turn this on when you want seen visits to flow into the billing queue automatically.</p>}
      </div>

      <div className="ss-save">
        {msg && <span className={`ss-msg ${msg === "Saved." ? "ok" : "err"}`}>{msg}</span>}
        <span className="ss-sp" />
        <button className="ss-btn" onClick={save} disabled={busy || !dirty}>{busy ? "Saving…" : dirty ? "Save settings" : "Saved"}</button>
      </div>
    </div>
  );
}
