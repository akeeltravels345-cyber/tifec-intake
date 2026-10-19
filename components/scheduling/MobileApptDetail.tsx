"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MobileBack from "./MobileBack";

type Appt = {
  id: string; clientName: string; clientEmail: string; mode: "in_person" | "virtual" | "either";
  status: string; capacity: number; locationOrLink: string; billingSessionId: string | null;
  intakeStatus: string; insurancePath: string | null; seriesId: string | null; startAtDate: string;
  startAt: string; endAt: string;
};

const isLink = (v: string) => /^https?:\/\//.test(v || "");

function Circle({ done }: { done: boolean }) {
  return done
    ? <span className="mdet-ck done"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg></span>
    : <span className="mdet-ck" aria-hidden="true" />;
}

export default function MobileApptDetail({ appt, typeName, durMin, whenText, insurerName, bookedBy, bookedOn, intakeForms, canEdit, attended, seriesIndex, seriesTotal, lastSeenText }: {
  appt: Appt; typeName: string; durMin: number; whenText: string; insurerName: string | null;
  bookedBy: string; bookedOn: string; intakeForms: { key: string; label: string }[]; canEdit: boolean;
  attended: boolean | null; seriesIndex: number | null; seriesTotal: number | null; lastSeenText: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sheet, setSheet] = useState<null | "more" | "cancel">(null);

  const group = appt.capacity > 1;
  const online = appt.mode === "virtual";
  const cancelled = appt.status === "cancelled";
  const logged = !!appt.billingSessionId;
  const noShow = appt.status === "no_show" || attended === false;
  const seen = appt.status === "seen" || attended === true;
  const title = group ? typeName : (appt.clientName || "Appointment");

  const startMs = Date.parse(appt.startAt), endMs = Date.parse(appt.endAt), now = Date.now();
  const ended = endMs <= now;
  const minsToStart = Math.round((startMs - now) / 60000);
  const minsSinceEnd = Math.round((now - endMs) / 60000);
  const fmtMins = (m: number) => (m >= 120 ? `${Math.round(m / 60)} hr` : m >= 60 ? `1 hr ${m - 60} min` : `${m} min`);

  async function act(body: Record<string, unknown>, tag: string, after?: () => void) {
    setBusy(tag); setMsg(null);
    try {
      const res = await fetch("/api/scheduling/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { if (after) after(); else { router.refresh(); } setBusy(""); return; }
      setMsg({ ok: false, text: d.error || "Something went wrong." });
    } catch { setMsg({ ok: false, text: "Something went wrong." }); }
    setBusy("");
  }
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

  const banner = cancelled
    ? { tone: "err", text: "This appointment was cancelled." }
    : ended && !logged
      ? { tone: "amber", text: `Session ended ${fmtMins(Math.max(0, minsSinceEnd))} ago and isn't logged for billing yet.` }
      : !ended && minsToStart <= 90 && minsToStart >= -5
        ? { tone: "ok", text: `Starts in ${fmtMins(Math.max(0, minsToStart))}.${appt.intakeStatus === "pending" ? " Intake is still outstanding." : ""}` }
        : null;

  return (
    <div className="mflow mdet">
      <header className="mdet-head">
        <div className="mdet-head-row">
          <MobileBack className="mflow-x" ariaLabel="Back"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg></MobileBack>
          {canEdit && !cancelled && <button className="mflow-x" onClick={() => setSheet("more")} aria-label="More"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></svg></button>}
        </div>
        <div className="meyebrow">{typeName.toUpperCase()} · {durMin} MIN</div>
        <h1 className="mdet-title">{title}</h1>
        <div className="mdet-when">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
          {whenText}{appt.seriesId ? " · Weekly" : ""}
        </div>
      </header>

      <div className="mflow-body mdet-body">
        {banner && <div className={`mdet-banner ${banner.tone}`}>{banner.text}</div>}
        {online && isLink(appt.locationOrLink) && !cancelled && (
          <a className="mbtn accent block mdet-join" href={appt.locationOrLink} target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 10l5-3v10l-5-3" /><rect x="3" y="6" width="12" height="12" rx="2" /></svg> Join video call</a>
        )}

        {!cancelled && (
          <div className="mcard mdet-check">
            <div className="meyebrow">BEFORE &amp; AFTER</div>
            <div className="mdet-checkrow">
              <Circle done={appt.intakeStatus === "received"} />
              <div className="mdet-checktxt"><b>Intake</b><small>{appt.intakeStatus === "received" ? "Complete" : appt.intakeStatus === "pending" ? "Outstanding" : "Not required"}</small></div>
              {appt.intakeStatus === "pending" && canEdit && <button className="mdet-mini" disabled={!!busy || !appt.clientEmail} onClick={sendIntake}>{busy === "intake" ? "…" : "Send"}</button>}
            </div>
            <div className={`mdet-checkrow${noShow ? " no" : ""}`}>
              <Circle done={seen} />
              <div className="mdet-checktxt"><b>Attended</b><small>{seen ? "Marked attended" : noShow ? "No-show" : ended ? "Not marked" : "Upcoming"}</small></div>
              {canEdit && (noShow
                ? <button className="mdet-mini" disabled={!!busy} onClick={() => act({ action: "status", id: appt.id, status: "booked" }, "undo")}>Undo</button>
                : !seen && <button className="mdet-mini" disabled={!!busy} onClick={() => act({ action: "status", id: appt.id, status: "no_show" }, "noshow")}>Mark no-show</button>)}
            </div>
            <div className="mdet-checkrow">
              <Circle done={logged} />
              <div className="mdet-checktxt"><b>Logged for billing</b><small>{logged ? "Done" : appt.insurancePath === "insurance" ? `Insurance${insurerName ? " · " + insurerName : ""}` : "Self-pay"}</small></div>
            </div>
          </div>
        )}

        <div className="mcard mdet-info">
          <div className="mdet-inforow"><span>{online ? "Link" : "Where"}</span><b>{online ? (isLink(appt.locationOrLink) ? "Video call" : "Online") : (appt.locationOrLink || "The Institute for Essential Care")}</b></div>
          <div className="mdet-inforow"><span>{group ? "Clients" : "Client email"}</span><b>{group ? `${appt.capacity} people` : (appt.clientEmail || "—")}</b></div>
          <div className="mdet-inforow"><span>Payment</span><b>{appt.insurancePath === "insurance" ? `Insurance${insurerName ? " · " + insurerName : ""}` : "Self-pay"}</b></div>
          <div className="mdet-inforow"><span>Session</span><b>{seriesIndex && seriesTotal ? `${seriesIndex} of ${seriesTotal}` : `${durMin} min`}</b></div>
          {lastSeenText && <div className="mdet-inforow"><span>Last seen</span><b>{lastSeenText}</b></div>}
          <div className="mdet-inforow"><span>Booked by</span><b>{bookedBy}{bookedOn ? ` · ${bookedOn}` : ""}</b></div>
        </div>

        {msg && <div className={`mmsg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}
      </div>

      {!cancelled && (
        <div className="mflow-foot mdet-foot">
          {canEdit && (
            <>
              <a className="mdet-fbtn" href={`/m/appt/${appt.id}/edit`} aria-label="Edit"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg></a>
              <button className="mdet-fbtn" disabled={!!busy || !appt.clientEmail || appt.intakeStatus !== "pending"} onClick={sendIntake} aria-label="Send intake"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg></button>
            </>
          )}
          {logged
            ? <span className="mbtn ghost block mdet-done">Logged for billing</span>
            : noShow
              ? <span className="mbtn ghost block mdet-done">Marked no-show</span>
              : online && !ended && isLink(appt.locationOrLink)
                ? <a className="mbtn accent block" href={appt.locationOrLink} target="_blank" rel="noopener noreferrer">Join video call</a>
                : group && !ended
                  ? <a className="mbtn primary block" href={`/billing/sessions/new?fromAppt=${appt.id}`}>Take attendance</a>
                  : <a className="mbtn primary block" href={`/billing/sessions/new?fromAppt=${appt.id}`}>Log this session</a>}
        </div>
      )}

      {sheet === "more" && (
        <div className="msheet-ov" onClick={() => setSheet(null)}>
          <div className="msheet" onClick={(e) => e.stopPropagation()}>
            <div className="msheet-grab" aria-hidden="true" />
            <a className="msheet-plain" href={`/m/appt/${appt.id}/edit`}>Move to another time</a>
            {noShow
              ? <button className="msheet-plain" disabled={!!busy} onClick={() => act({ action: "status", id: appt.id, status: "booked" }, "undo", () => { setSheet(null); router.refresh(); })}>Undo no-show</button>
              : <button className="msheet-plain" disabled={!!busy} onClick={() => act({ action: "status", id: appt.id, status: "no_show" }, "noshow", () => { setSheet(null); router.refresh(); })}>Mark as no-show</button>}
            <button className="msheet-plain danger" onClick={() => setSheet("cancel")}>Cancel and ask to rebook</button>
          </div>
        </div>
      )}

      {sheet === "cancel" && (
        <div className="msheet-ov" onClick={() => !busy && setSheet(null)}>
          <div className="msheet" onClick={(e) => e.stopPropagation()}>
            <div className="msheet-grab" aria-hidden="true" />
            <div className="msheet-title">Cancel this appointment?</div>
            <p className="mdet-cancel-sub">We&apos;ll cancel it and email {appt.clientName || "the client"} a link to pick a new time.</p>
            <button className="mbtn danger block" disabled={!!busy} onClick={() => act({ action: "cancelRebook", id: appt.id }, "cancel", () => router.push("/m"))}>{busy === "cancel" ? "Cancelling…" : "Cancel & ask to rebook"}</button>
            <button className="mbtn ghost block" style={{ marginTop: 9 }} disabled={!!busy} onClick={() => setSheet(null)}>Keep it</button>
          </div>
        </div>
      )}
    </div>
  );
}
