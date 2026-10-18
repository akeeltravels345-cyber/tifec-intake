"use client";

import { useMemo, useState } from "react";
import InstallPrompt from "@/components/InstallPrompt";
import MobileWhoPicker from "@/components/scheduling/MobileWhoPicker";

type Appt = {
  id: string; startAt: string; endAt: string; clientName: string; typeId: string | null;
  mode: "in_person" | "virtual" | "either"; status: string; capacity: number;
  locationOrLink: string; billingSessionId: string | null; intakeStatus: string;
  insurancePath: string | null; insurerId: string | null; seriesId: string | null; clinicianId?: string;
};
type Type = { id: string; name: string; mode: string; capacity: number };
const lastName = (name: string) => name.replace(/^\s*(dr|mr|mrs|ms|mx|prof)\.?\s+/i, "").trim().split(/\s+/).pop() || name;

const CAY = 5; // Cayman UTC-5, no DST
const cayDate = (iso: string) => new Date(Date.parse(iso) - CAY * 3600e3).toISOString().slice(0, 10);
const cayMin = (iso: string) => { const d = new Date(Date.parse(iso) - CAY * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const label12 = (min: number) => { let h = Math.floor(min / 60); const m = min % 60; const ap = h < 12 ? "am" : "pm"; h = h % 12 || 12; return { t: `${h}${m ? ":" + String(m).padStart(2, "0") : ""}`, ap }; };
const addDays = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const mondayOf = (d: string) => { const [y, m, dd] = d.split("-").map(Number); const w = (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7; return addDays(d, -w); };
const parts = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd)); };
const DOW = ["M", "T", "W", "T", "F", "S", "S"];

const isFreeConsult = (name?: string | null) => /free\b.*consult/i.test(name || "");
const cleanType = (name?: string | null) => (name || "").replace(/\s*-\s*(in\s*person|online|virtual)\b/i, "").replace(/\s{2,}/g, " ").trim();
const initialsOf = (name: string) => {
  const words = name.replace(/^\s*(dr|mr|mrs|ms|mx|prof)\.?\s+/i, "").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "?";
};

export default function MobileAgenda({ appts, types, todayCayman, initialDay, clinicianName, bookingUrl, clinicians, who, myId }: { appts: Appt[]; types: Type[]; todayCayman: string; initialDay?: string; clinicianName: string; bookingUrl: string; clinicians: { id: string; name: string }[]; who: string; myId: string }) {
  const viewingOwn = who === myId;
  const showAll = who === "all";
  const clinName = (id?: string) => (id ? (clinicians.find((c) => c.id === id)?.name || "") : "");
  const start0 = initialDay || todayCayman;
  const [selected, setSelected] = useState(start0);
  const [weekStart, setWeekStart] = useState(mondayOf(start0));
  const [account, setAccount] = useState(false);
  const [copied, setCopied] = useState(false);
  const [signing, setSigning] = useState(false);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(bookingUrl); }
    catch { try { const ta = document.createElement("textarea"); ta.value = bookingUrl; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); } catch { /* ignore */ } }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  const shareLink = async () => {
    const nav = navigator as Navigator & { share?: (d: { title?: string; url?: string }) => Promise<void> };
    if (nav.share) { try { await nav.share({ title: "Book an appointment", url: bookingUrl }); return; } catch { /* fall through */ } }
    copyLink();
  };
  const signOut = async () => {
    setSigning(true);
    try { document.cookie = "dev_role=; path=/; max-age=0"; document.cookie = "dev_as=; path=/; max-age=0"; await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    window.location.href = "/login?next=/m";
  };

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const live = useMemo(() => appts.filter((a) => a.status !== "cancelled"), [appts]);
  const daysWithAppts = useMemo(() => new Set(live.map((a) => cayDate(a.startAt))), [live]);

  const dayList = useMemo(() =>
    live.filter((a) => cayDate(a.startAt) === selected).sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [live, selected]);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const selDate = parts(selected);
  const headDow = selDate.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long" });
  const headDate = selDate.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "long" });

  const accentOf = (a: Appt) => { const t = a.typeId ? typeById.get(a.typeId) : undefined; return isFreeConsult(t?.name) ? "#D85A30" : (a.capacity > 1 ? "#2E3192" : "#2F8E93"); };
  const titleOf = (a: Appt) => { const t = a.typeId ? typeById.get(a.typeId) : undefined; return a.capacity > 1 ? (cleanType(t?.name) || "Group session") : (a.clientName || "Appointment"); };
  const subOf = (a: Appt) => { const t = a.typeId ? typeById.get(a.typeId) : undefined; return a.capacity > 1 ? `${a.capacity} people` : (cleanType(t?.name) || "Appointment"); };

  const pickDay = (d: string) => { setSelected(d); if (d < weekStart || d > addDays(weekStart, 6)) setWeekStart(mondayOf(d)); };

  return (
    <div className="mag">
      <header className="mag-head">
        <div className="mag-head-row">
          <div>
            <div className="mag-dow">{headDow}</div>
            <div className="mag-date">{headDate}</div>
          </div>
          <button className="mag-av" onClick={() => setAccount(true)} aria-label="Account and booking link">{initialsOf(clinicianName)}</button>
        </div>
        <div className="mag-strip">
          <button className="mag-wk" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</button>
          {weekDays.map((d, i) => {
            const on = d === selected, isToday = d === todayCayman, has = daysWithAppts.has(d);
            return (
              <button key={d} className={`mag-day${on ? " on" : ""}`} onClick={() => pickDay(d)} aria-label={d} aria-current={on ? "date" : undefined}>
                <span className="mag-day-l">{DOW[i]}</span>
                <span className={`mag-day-n${isToday && !on ? " today" : ""}`}>{parts(d).getUTCDate()}</span>
                <span className={`mag-dot${has ? " show" : ""}`} aria-hidden="true" />
              </button>
            );
          })}
          <button className="mag-wk" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>›</button>
        </div>
      </header>

      <div className="mag-body">
        <InstallPrompt />
        <div className="mag-toprow">
          <MobileWhoPicker clinicians={clinicians} who={who} myId={myId} />
          <span className="mag-count">{dayList.length === 0 ? "none" : `${dayList.length} appt${dayList.length === 1 ? "" : "s"}`}</span>
        </div>

        {dayList.length === 0 ? (
          <div className="mag-empty">
            <span className="mag-empty-ic" aria-hidden="true">✦</span>
            <p>Nothing booked for this day.</p>
            {viewingOwn && <a className="mag-empty-btn" href="/m/book">Book an appointment</a>}
          </div>
        ) : (
          <div className="mag-list">
            {dayList.map((a) => {
              const s = cayMin(a.startAt), lbl = label12(s);
              const virtual = a.mode === "virtual";
              return (
                <a key={a.id} className="mag-card" style={{ borderLeftColor: accentOf(a) }} href={`/m/appt/${a.id}`}>
                  <span className="mag-card-time"><b>{lbl.t}</b><small>{lbl.ap}</small></span>
                  <span className="mag-card-main">
                    <span className="mag-card-name">{titleOf(a)}</span>
                    <span className="mag-card-sub">{subOf(a)}</span>
                    <span className="mag-card-mode">
                      {virtual ? <><Ic n="video" /> Online</> : <><Ic n="pin" /> In person</>}
                      {showAll && a.clinicianId ? <span className="mag-card-who">· {lastName(clinName(a.clinicianId))}</span> : null}
                      {a.billingSessionId ? <span className="mag-logged">· ✓ logged</span> : a.intakeStatus === "pending" ? <span className="mag-intake">· intake due</span> : null}
                    </span>
                  </span>
                  <span className="mag-card-go" aria-hidden="true">›</span>
                </a>
              );
            })}
          </div>
        )}
      </div>

      {viewingOwn && <a className="mag-fab" href="/m/book" aria-label="Book an appointment"><Ic n="plus" /></a>}

      {account && (
        <div className="mag-sheet-ov" onClick={() => setAccount(false)}>
          <div className="mag-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mag-sheet-grab" aria-hidden="true" />
            <div className="mag-sheet-name">{clinicianName}</div>
            <div className="mme-sec">Your booking link</div>
            <div className="mme-link">{bookingUrl.replace(/^https?:\/\//, "")}</div>
            <div className="mme-linkrow">
              <button className="mme-btn teal" onClick={shareLink}>Share link</button>
              <button className="mme-btn ghost" onClick={copyLink}>{copied ? "Copied ✓" : "Copy"}</button>
            </div>
            <div className="mag-acct-rows">
              <a className="mme-row" href="/m/hours"><span>Your hours &amp; availability</span><span className="mme-chev" aria-hidden="true">›</span></a>
              <a className="mme-row" href="/today"><span>Open the full web app</span><span className="mme-chev" aria-hidden="true">›</span></a>
              <button className="mme-row danger" onClick={signOut} disabled={signing}><span>{signing ? "Signing out…" : "Sign out"}</span></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Ic({ n }: { n: "video" | "pin" | "plus" }) {
  const common = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (n === "video") return (<svg {...common}><path d="M15 10l5-3v10l-5-3" /><rect x="3" y="6" width="12" height="12" rx="2" /></svg>);
  if (n === "pin") return (<svg {...common}><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>);
  return (<svg {...{ ...common, width: 24, height: 24, strokeWidth: 2.2 }}><path d="M12 5v14M5 12h14" /></svg>);
}
