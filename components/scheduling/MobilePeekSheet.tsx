"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type PeekAppt = {
  id: string; kind: "appointment" | "block"; title: string; clientName: string;
  startAt: string; endAt: string; mode: "in_person" | "virtual" | "either";
  typeName: string; capacity: number; status: string; billingSessionId: string | null;
  intakeStatus: string; locationOrLink: string; insurancePath: string | null; typeClass: string;
};

const CAY = 5;
const cayMin = (iso: string) => { const d = new Date(Date.parse(iso) - CAY * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const lbl = (min: number) => { let h = Math.floor(min / 60); const m = min % 60; const ap = h < 12 ? "AM" : "PM"; h = h % 12 || 12; return `${h}${m ? ":" + String(m).padStart(2, "0") : ""}${ap}`; };
const isLink = (v: string) => /^https?:\/\//.test(v || "");
const initialsOf = (name: string) => { const w = name.replace(/^\s*(dr|mr|mrs|ms|mx|prof)\.?\s+/i, "").trim().split(/\s+/).filter(Boolean); return w.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "?"; };

function Tile({ icon, label, onClick, href, tone, disabled }: { icon: React.ReactNode; label: string; onClick?: () => void; href?: string; tone?: string; disabled?: boolean }) {
  const cls = `mpeek-tile${tone ? " " + tone : ""}${disabled ? " off" : ""}`;
  const inner = <><span className="mpeek-tile-ic">{icon}</span><span>{label}</span></>;
  if (href && !disabled) return <a className={cls} href={href}>{inner}</a>;
  return <button className={cls} onClick={onClick} disabled={disabled}>{inner}</button>;
}

export default function MobilePeekSheet({ appt, onClose }: { appt: PeekAppt; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const group = appt.capacity > 1;
  const online = appt.mode === "virtual";
  const future = Date.parse(appt.startAt) > Date.now();
  const logged = !!appt.billingSessionId;
  const seen = appt.status === "seen";

  async function post(body: Record<string, unknown>, tag: string) {
    setBusy(tag);
    try {
      const res = await fetch("/api/scheduling/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { onClose(); router.refresh(); return; }
    } catch { /* ignore */ }
    setBusy("");
  }

  if (appt.kind === "block") {
    return (
      <div className="msheet-ov" onClick={onClose}>
        <div className="msheet mpeek" onClick={(e) => e.stopPropagation()}>
          <div className="msheet-grab" aria-hidden="true" />
          <div className="mpeek-head">
            <div><div className="meyebrow">{lbl(cayMin(appt.startAt))} TO {lbl(cayMin(appt.endAt))} · BLOCKED</div><div className="mpeek-name">{appt.title || "Blocked time"}</div></div>
          </div>
          <button className="mbtn danger block" disabled={!!busy} onClick={() => post({ action: "delete", id: appt.id }, "del")} style={{ marginTop: 14 }}>{busy === "del" ? "Removing…" : "Remove block"}</button>
        </div>
      </div>
    );
  }

  const name = group ? appt.typeName : (appt.clientName || "Appointment");
  const sub = group ? `${appt.capacity} people` : appt.typeName;

  return (
    <div className="msheet-ov" onClick={onClose}>
      <div className="msheet mpeek" onClick={(e) => e.stopPropagation()}>
        <div className="msheet-grab" aria-hidden="true" />
        <div className="mpeek-head">
          <div className="mpeek-head-txt">
            <div className="meyebrow">{lbl(cayMin(appt.startAt))} TO {lbl(cayMin(appt.endAt))} · {online ? "ONLINE" : "IN PERSON"}</div>
            <div className="mpeek-name">{name}</div>
            <div className="mpeek-sub">{sub}</div>
          </div>
          <span className={`mpeek-av ${appt.typeClass}`}>{group ? sub.split(" ")[0] : initialsOf(appt.clientName)}</span>
        </div>

        <div className="mpeek-chips">
          <span className={`mchip ${appt.status === "cancelled" ? "err" : "ok"}`}>{appt.status === "seen" ? "Attended" : appt.status === "no_show" ? "No-show" : "Booked"}</span>
          {appt.intakeStatus === "received" && <span className="mchip ok">Intake complete</span>}
          {appt.intakeStatus === "pending" && <span className="mchip warn">Intake outstanding</span>}
          {appt.insurancePath === "insurance" && <span className="mchip">Insurance</span>}
          {logged && <span className="mchip ok">Logged</span>}
        </div>

        <div className="mpeek-tiles">
          {online && future && isLink(appt.locationOrLink)
            ? <Tile tone="primary" label="Join" href={appt.locationOrLink} icon={<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M15 10l5-3v10l-5-3" /><rect x="3" y="6" width="12" height="12" rx="2" /></svg>} />
            : <Tile tone={seen ? "done" : ""} label={seen ? "Attended" : "Check in"} disabled={seen || !!busy} onClick={() => post({ action: "status", id: appt.id, status: "seen" }, "seen")} icon={<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 11l2 2 4-4" /><circle cx="9" cy="8" r="4" /><path d="M3 20c0-3.5 3-5.5 6-5.5" /></svg>} />}
          <Tile tone={logged ? "done" : ""} label={logged ? "Logged" : "Log"} href={logged ? undefined : `/billing/sessions/new?fromAppt=${appt.id}`} disabled={logged} icon={<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>} />
          <Tile label="Edit" href={`/m/appt/${appt.id}/edit`} icon={<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>} />
          <Tile label="Message" href={appt.clientName ? `mailto:` : undefined} disabled={!appt.clientName} icon={<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>} />
        </div>

        <a className="mbtn ghost block" href={`/m/appt/${appt.id}`} style={{ marginTop: 12 }}>Open full details</a>
      </div>
    </div>
  );
}
