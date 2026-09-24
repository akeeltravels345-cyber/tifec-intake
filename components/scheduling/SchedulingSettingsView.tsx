"use client";

import { useState } from "react";
import QRCode from "qrcode";
import Foldable from "@/components/billing/Foldable";
import type { SchedulingSettings } from "@/lib/scheduling";

const ACCENTS = ["#256e72", "#2f8e93", "#2e3192", "#3f8f5f", "#7a4fa3", "#b1543c", "#c2841d"];
const sample = { client: "Ada Rivers", service: "Individual therapy", clinician: "Dr. Shion O'Connor", when: "Mon, 8 Sep at 10:00 AM", practice: "Cayman Essential Care" };
const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => (sample as Record<string, string>)[k] ?? `{${k}}`);

export default function SchedulingSettingsView({ initial, types = [], origin = "" }: {
  initial: SchedulingSettings; types?: { id: string; name: string }[];
  // Absolute origin computed on the SERVER so the printed links render identically
  // on server and client (no hydration mismatch) and copy/QR get full URLs.
  origin?: string;
}) {
  const [s, setS] = useState<SchedulingSettings>(initial);
  const [copied, setCopied] = useState("");
  const [qr, setQr] = useState<{ label: string; url: string; img: string } | null>(null);
  const baseLink = `${origin}/book`;
  const copy = (text: string, key: string) => { try { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1500); } catch { /* ignore */ } };
  const showQr = async (label: string, url: string) => { try { const img = await QRCode.toDataURL(url, { width: 320, margin: 1 }); setQr({ label, url, img }); } catch { /* ignore */ } };
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
      <div className="ss-head"><div><h1 className="ss-h1">Settings</h1><p className="ss-sub">Your booking page and the emails clients receive.</p></div></div>

      <div className="ss-card">
        <h2>Your booking page</h2>
        <p className="ss-hint">What clients see and agree to when they book online.</p>
        <label className="ss-f"><span>Welcome message <em>(shown under the title)</em></span>
          <textarea rows={2} value={s.booking.welcome} onChange={(e) => setBooking({ welcome: e.target.value })} placeholder="e.g. We're glad you're here. Pick a time that works for you." /></label>
        <div className="ss-f"><span>Accent colour</span>
          <div className="ss-swatches">{ACCENTS.map((c) => <button key={c} type="button" className={`ss-sw ${s.booking.accent === c ? "on" : ""}`} style={{ background: c }} onClick={() => setBooking({ accent: c })} aria-label={c} />)}</div>
        </div>
        <label className="ss-f"><span>Cancellation policy <em>(shown at booking; clients tick to accept)</em></span>
          <textarea rows={2} value={s.booking.policy} onChange={(e) => setBooking({ policy: e.target.value })} placeholder="e.g. Please give at least 24 hours notice to cancel or reschedule." /></label>
        <label className="ss-f"><span>Change window (hours) <em>clients can&apos;t self-cancel/reschedule inside this</em></span>
          <input type="number" min={0} value={s.booking.cancelWindowHours} onChange={(e) => setBooking({ cancelWindowHours: Math.max(0, Number(e.target.value)) })} /></label>
      </div>

      <div className="ss-card">
        <h2>Share your booking page</h2>
        <p className="ss-hint">Send clients straight to the right service. Each clinician also has their own personal links under My schedule → My link.</p>
        <div className="ss-link"><span className="ss-linkname">Everything <em>(all services)</em></span><code>{baseLink}</code><button onClick={() => copy(baseLink, "base")}>{copied === "base" ? "Copied" : "Copy"}</button><button onClick={() => showQr("Everything", baseLink)}>QR</button></div>
        <Foldable max={6} unit="services" rowSelector=".ss-link">
          <div>
            {types.map((t) => { const l = `${baseLink}?type=${t.id}`; return (
              <div key={t.id} className="ss-link"><span className="ss-linkname">{t.name}</span><code>{l}</code><button onClick={() => copy(l, t.id)}>{copied === t.id ? "Copied" : "Copy"}</button><button onClick={() => showQr(t.name, l)}>QR</button></div>
            ); })}
          </div>
        </Foldable>
      </div>

      {qr && (
        <div className="ss-qrmodal" onClick={() => setQr(null)}>
          <div className="ss-qrsheet" onClick={(e) => e.stopPropagation()}>
            <div className="ss-qrname">{qr.label}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.img} alt={`QR code for ${qr.label}`} width={280} height={280} />
            <code className="ss-qrurl">{qr.url}</code>
            <div className="ss-qrbtns">
              <a className="ss-btn" href={qr.img} download={`booking-${qr.label.replace(/\s+/g, "-").toLowerCase()}.png`}>Download PNG</a>
              <button className="ss-btn primary" onClick={() => setQr(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      <div className="ss-card">
        <div className="ss-notihead">
          <h2>Messages to clients</h2>
          <label className="ss-switch"><input type="checkbox" checked={n.enabled} onChange={(e) => setNotif({ enabled: e.target.checked })} /> <span>{n.enabled ? "On" : "Off"}</span></label>
        </div>
        <p className="ss-hint">The emails clients get automatically. The switch turns all of them on or off at once.</p>
        {!n.enabled && <p className="ss-warn">Off — nothing is sent to clients yet. Turn this on when you&apos;re ready to start sending.</p>}
        <div className="ss-f"><span>Which emails to send</span>
          <div className="ss-toggles">
            {([["confirmation", "Booking confirmation"], ["reminder", "Reminders"], ["reschedule", "Reschedule notice"], ["cancellation", "Cancellation notice"]] as const).map(([k, label]) => (
              <label key={k} className="ss-chk"><input type="checkbox" checked={n[k]} onChange={(e) => setNotif({ [k]: e.target.checked } as never)} /> {label}</label>
            ))}
          </div>
        </div>
        <label className="ss-f"><span>Reminder timing <em>hours before the appointment, separated by commas</em></span>
          <input value={n.reminderOffsetsHours.join(", ")} onChange={(e) => setNotif({ reminderOffsetsHours: e.target.value.split(",").map((x) => parseInt(x.trim(), 10)).filter((x) => x > 0) })} placeholder="e.g. 24, 1" /></label>

        <div className="ss-subsec">
          <h3>What the emails say</h3>
          <p className="ss-hint">Type your wording. These fill in automatically: <code className="ss-ph">{"{client}"}</code> <code className="ss-ph">{"{service}"}</code> <code className="ss-ph">{"{clinician}"}</code> <code className="ss-ph">{"{when}"}</code> <code className="ss-ph">{"{practice}"}</code></p>
          {(["confirmation", "reminder"] as const).map((k) => (
            <div key={k} className="ss-tpl">
              <div className="ss-tpl-name">{k === "confirmation" ? "Confirmation email" : "Reminder email"}</div>
              <label className="ss-f"><span>Subject</span><input value={n.templates[k].subject} onChange={(e) => setTpl(k, { subject: e.target.value })} /></label>
              <label className="ss-f"><span>Body</span><textarea rows={4} value={n.templates[k].body} onChange={(e) => setTpl(k, { body: e.target.value })} /></label>
              <div className="ss-preview"><div className="ss-preview-l">Preview</div><div className="ss-preview-s">{fill(n.templates[k].subject)}</div><div className="ss-preview-b">{fill(n.templates[k].body)}</div></div>
            </div>
          ))}
        </div>
      </div>

      <div className="ss-card">
        <h2>Video appointments</h2>
        <p className="ss-hint">Each clinician connects their own Zoom or Google Meet from <b>My schedule → Set up</b>. When one of their online appointments is booked, the meeting link is created for them automatically.</p>
      </div>

      <div className="ss-card">
        <div className="ss-notihead">
          <h2>Send visits to billing</h2>
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
