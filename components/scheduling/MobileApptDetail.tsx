"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Appt = {
  id: string; clientName: string; clientEmail: string; mode: "in_person" | "virtual" | "either";
  status: string; capacity: number; locationOrLink: string; billingSessionId: string | null;
  intakeStatus: string; insurancePath: string | null; seriesId: string | null; startAtDate: string;
};

const CAY = 5;
const isLink = (v: string) => /^https?:\/\//.test(v || "");
const STATUS: Record<string, string> = { booked: "Booked", confirmed: "Confirmed", seen: "Seen", no_show: "No-show", cancelled: "Cancelled" };
const utcFromCay = (date: string, hhmm: string) => { const [y, m, d] = date.split("-").map(Number); const [h, mi] = hhmm.split(":").map(Number); return new Date(Date.UTC(y, m - 1, d, CAY + h, mi)).toISOString(); };

export default function MobileApptDetail({ appt, typeName, durMin, whenText, insurerName, bookedBy, bookedOn, intakeForms, canEdit }: {
  appt: Appt; typeName: string; durMin: number; whenText: string; insurerName: string | null;
  bookedBy: string; bookedOn: string; intakeForms: { key: string; label: string }[]; canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [resched, setResched] = useState(false);
  const [rDate, setRDate] = useState(appt.startAtDate);
  const [rTime, setRTime] = useState("09:00");
  const [notify, setNotify] = useState(true);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const virtual = appt.mode === "virtual";
  const title = appt.capacity > 1 ? typeName : (appt.clientName || "Appointment");
  const cancelled = appt.status === "cancelled";

  async function sendIntake() {
    if (!intakeForms.length) return setMsg({ ok: false, text: "No intake form applies to this service." });
    setBusy("intake"); setMsg(null);
    try {
      const res = await fetch("/api/scheduling/intake-send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: appt.id, forms: intakeForms.map((f) => f.key) }) });
      const d = await res.json();
      setMsg(res.ok ? { ok: true, text: `Intake sent to ${appt.clientName || "the client"}.` } : { ok: false, text: d.error || "Couldn't send the intake." });
    } catch { setMsg({ ok: false, text: "Couldn't send the intake." }); }
    setBusy("");
  }

  async function saveResched() {
    setBusy("resched"); setMsg(null);
    try {
      const startAt = utcFromCay(rDate, rTime);
      const endAt = new Date(Date.parse(startAt) + durMin * 60000).toISOString();
      const res = await fetch("/api/scheduling/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", id: appt.id, startAt, endAt, notifyClient: notify }) });
      const d = await res.json();
      if (res.ok) { setResched(false); router.push("/m"); router.refresh(); }
      else setMsg({ ok: false, text: d.error || "Couldn't reschedule." });
    } catch { setMsg({ ok: false, text: "Couldn't reschedule." }); }
    setBusy("");
  }

  async function doCancelRebook() {
    setBusy("cancel"); setMsg(null);
    try {
      const res = await fetch("/api/scheduling/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancelRebook", id: appt.id }) });
      const d = await res.json();
      if (res.ok) { router.push("/m"); router.refresh(); }
      else { setMsg({ ok: false, text: d.error || "Couldn't cancel." }); setBusy(""); setConfirmCancel(false); }
    } catch { setMsg({ ok: false, text: "Couldn't cancel." }); setBusy(""); setConfirmCancel(false); }
  }

  return (
    <div className="madet">
      <header className="madet-head">
        <div className="madet-head-top">
          <a href="/m" className="madet-back" aria-label="Back"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg></a>
        </div>
        <div className="madet-title">{title}</div>
        <div className="madet-sub">{typeName} · {durMin} min</div>
        <div className="madet-when"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: "-2px" }}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg> {whenText}{appt.seriesId ? " · ↻ series" : ""}</div>
      </header>

      <div className="madet-body">
        {virtual && isLink(appt.locationOrLink) && (
          <a className="madet-join" href={appt.locationOrLink} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 10l5-3v10l-5-3" /><rect x="3" y="6" width="12" height="12" rx="2" /></svg>
            Join video call
          </a>
        )}

        <div className="madet-chips">
          <span className={`madet-chip ${cancelled ? "warn" : "ok"}`}>{STATUS[appt.status] || appt.status}</span>
          {appt.intakeStatus === "received" && <span className="madet-chip ok">Intake complete</span>}
          {appt.intakeStatus === "pending" && <span className="madet-chip warn">Intake outstanding</span>}
        </div>

        <div className="madet-rows">
          <div><span>Mode</span><b>{virtual ? "Online" : "In person"}</b></div>
          <div><span>Payment</span><b>{appt.insurancePath === "insurance" ? `Insurance${insurerName ? " · " + insurerName : ""}` : "Self-pay"}</b></div>
          {appt.capacity > 1 && <div><span>Seats</span><b>{appt.capacity} people</b></div>}
          <div><span>Client email</span><b>{appt.clientEmail || "—"}</b></div>
          <div><span>Booked by</span><b>{bookedBy}</b></div>
          {bookedOn && <div><span>Booked on</span><b>{bookedOn}</b></div>}
        </div>

        {msg && <div className={`madet-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}

        {!cancelled && (
          <div className="madet-actions">
            {appt.billingSessionId
              ? <div className="madet-done">✓ Logged for billing</div>
              : <a className="madet-btn primary" href={`/billing/sessions/new?fromAppt=${appt.id}`}>Log this session</a>}

            {canEdit && (
              <>
                <div className="madet-row2">
                  <button className="madet-btn ghost" disabled={!!busy || !appt.clientEmail} onClick={sendIntake}>{busy === "intake" ? "Sending…" : "Send intake"}</button>
                  <button className="madet-btn ghost" disabled={!!busy} onClick={() => { setResched(true); setMsg(null); }}>Reschedule</button>
                </div>
                <button className="madet-btn danger" disabled={!!busy} onClick={() => setConfirmCancel(true)}>Cancel &amp; ask to rebook</button>
              </>
            )}
          </div>
        )}
      </div>

      {resched && (
        <div className="mag-sheet-ov" onClick={() => setResched(false)}>
          <div className="mag-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mag-sheet-grab" aria-hidden="true" />
            <div className="mag-sheet-name">Reschedule</div>
            <div className="madet-f"><label>New date</label><input type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} /></div>
            <div className="madet-f"><label>Start time</label><input type="time" value={rTime} onChange={(e) => setRTime(e.target.value)} /></div>
            <label className="madet-toggle"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email the client the new time</label>
            <div className="mag-sheet-actions">
              <button className="mag-btn primary" disabled={!!busy} onClick={saveResched}>{busy === "resched" ? "Saving…" : "Save new time"}</button>
              <button className="mag-btn ghost" onClick={() => setResched(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {confirmCancel && (
        <div className="mag-sheet-ov" onClick={() => !busy && setConfirmCancel(false)}>
          <div className="mag-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mag-sheet-grab" aria-hidden="true" />
            <div className="mag-sheet-name">Cancel this appointment?</div>
            <div className="mag-sheet-sub">We&apos;ll cancel it and email {appt.clientName || "the client"} a link to pick a new time.</div>
            <div className="mag-sheet-actions">
              <button className="mag-btn danger-solid" disabled={!!busy} onClick={doCancelRebook}>{busy === "cancel" ? "Cancelling…" : "Cancel & ask to rebook"}</button>
              <button className="mag-btn ghost" disabled={!!busy} onClick={() => setConfirmCancel(false)}>Keep it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
