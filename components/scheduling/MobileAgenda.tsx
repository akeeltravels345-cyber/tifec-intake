"use client";

import { useEffect, useMemo, useState } from "react";
import InstallPrompt from "@/components/InstallPrompt";
import MobileWhoPicker from "@/components/scheduling/MobileWhoPicker";

type Appt = {
  id: string; startAt: string; endAt: string; clientName: string; typeId: string | null;
  mode: "in_person" | "virtual" | "either"; status: string; capacity: number;
  locationOrLink: string; billingSessionId: string | null; intakeStatus: string;
  insurancePath: string | null; insurerId: string | null; seriesId: string | null; clinicianId?: string;
  kind?: string; title?: string | null;
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
// Day-grid (Acuity-style): hours down the side, appointment blocks placed by time.
const DAY_START = 7, DAY_END = 21, HOUR = 84; // 7am–9pm, px per hour (roomy, Acuity-style)
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
const tintOf = (free: boolean, group: boolean) => free ? { bg: "#faeae4", bar: "#D85A30" } : group ? { bg: "#e9eaf6", bar: "#2E3192" } : { bg: "#e4f3ee", bar: "#1f7a6f" };

const isFreeConsult = (name?: string | null) => /free\b.*consult/i.test(name || "");
const cleanType = (name?: string | null) => (name || "").replace(/\s*-\s*(in\s*person|online|virtual)\b/i, "").replace(/\s{2,}/g, " ").trim();
const initialsOf = (name: string) => {
  const words = name.replace(/^\s*(dr|mr|mrs|ms|mx|prof)\.?\s+/i, "").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "?";
};

export default function MobileAgenda({ appts, types, todayCayman, initialDay, clinicianName, bookingUrl, clinicians, who, myId, unread = 0 }: { appts: Appt[]; types: Type[]; todayCayman: string; initialDay?: string; clinicianName: string; bookingUrl: string; clinicians: { id: string; name: string }[]; who: string; myId: string; unread?: number }) {
  const viewingOwn = who === myId;
  const showAll = who === "all";
  const clinName = (id?: string) => (id ? (clinicians.find((c) => c.id === id)?.name || "") : "");
  const start0 = initialDay || todayCayman;
  const [selected, setSelected] = useState(start0);
  const [weekStart, setWeekStart] = useState(mondayOf(start0));
  const [account, setAccount] = useState(false);
  const [copied, setCopied] = useState(false);
  const [signing, setSigning] = useState(false);
  const [fabMenu, setFabMenu] = useState(false);

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
  const daysWithAppts = useMemo(() => new Set(live.filter((a) => a.kind !== "block").map((a) => cayDate(a.startAt))), [live]);

  const dayList = useMemo(() =>
    live.filter((a) => a.kind !== "block" && cayDate(a.startAt) === selected).sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [live, selected]);

  // Blocked-off time on the selected day — grey bands behind the appointments.
  const dayBlocks = useMemo(() =>
    live.filter((a) => a.kind === "block" && cayDate(a.startAt) === selected),
    [live, selected]);

  // Lane-pack overlapping appointments so they sit side by side in the grid.
  const placed = useMemo(() => {
    const items = dayList.map((a) => ({ a, s: cayMin(a.startAt), e: Math.max(cayMin(a.startAt) + 15, cayMin(a.endAt)) })).sort((x, y) => x.s - y.s || x.e - y.e);
    const lanes: number[] = [];
    const out = items.map((it) => { let lane = lanes.findIndex((end) => end <= it.s); if (lane === -1) { lane = lanes.length; lanes.push(it.e); } else lanes[lane] = it.e; return { ...it, lane }; });
    const laneCount = Math.max(1, lanes.length);
    return out.map((p) => ({ ...p, laneCount }));
  }, [dayList]);

  // The red "now" line, client-side only (avoids a hydration mismatch).
  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => {
    const upd = () => { const d = new Date(Date.now() - CAY * 3600e3); setNowMin(d.getUTCHours() * 60 + d.getUTCMinutes()); };
    upd(); const id = setInterval(upd, 60000); return () => clearInterval(id);
  }, []);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const selDate = parts(selected);
  const headDow = selDate.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long" });
  const headDate = selDate.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "long" });

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
          <div className="mag-head-actions">
            <a className="mag-bell" href="/m/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
              <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
              {unread > 0 && <span className="mag-bell-badge">{unread > 9 ? "9+" : unread}</span>}
            </a>
            <button className="mag-av" onClick={() => setAccount(true)} aria-label="Account and booking link">{initialsOf(clinicianName)}</button>
          </div>
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

        <div className="mgrid" style={{ height: (DAY_END - DAY_START) * HOUR + 10 }}>
          {Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i).map((h) => (
            <div key={h} className="mgrid-row" style={{ top: (h - DAY_START) * HOUR }}>
              <span className="mgrid-hr">{hourLabel(h)}</span>
              <span className="mgrid-line" />
              {h < DAY_END && <span className="mgrid-half" style={{ top: HOUR / 2 }} />}
            </div>
          ))}
          {dayBlocks.map((b) => {
            const bs = Math.max(cayMin(b.startAt), DAY_START * 60), be = Math.min(Math.max(cayMin(b.startAt) + 15, cayMin(b.endAt)), DAY_END * 60);
            if (be <= bs) return null;
            const top = ((bs - DAY_START * 60) / 60) * HOUR, height = Math.max(22, ((be - bs) / 60) * HOUR - 2);
            return (
              <div key={b.id} className="mgrid-block" style={{ top, height }}>
                <span className="mgrid-block-l">{(b.title || "Blocked").trim()}</span>
              </div>
            );
          })}
          {selected === todayCayman && nowMin != null && nowMin >= DAY_START * 60 && nowMin <= DAY_END * 60 && (
            <div className="mgrid-now" style={{ top: ((nowMin - DAY_START * 60) / 60) * HOUR }}><span /></div>
          )}
          <div className="mgrid-appts">
            {placed.map((p) => {
              const a = p.a;
              const vs = Math.max(p.s, DAY_START * 60), ve = Math.min(p.e, DAY_END * 60);
              if (ve <= vs) return null;
              const top = ((vs - DAY_START * 60) / 60) * HOUR, height = Math.max(30, ((ve - vs) / 60) * HOUR - 2);
              const w = 100 / p.laneCount, left = p.lane * w;
              const t = a.typeId ? typeById.get(a.typeId) : undefined;
              const tint = tintOf(isFreeConsult(t?.name), a.capacity > 1);
              const lblS = label12(cayMin(a.startAt)), lblE = label12(cayMin(a.endAt));
              const timeRange = `${lblS.t}${lblS.ap !== lblE.ap ? lblS.ap : ""}-${lblE.t}${lblE.ap}`;
              // Short appointments (e.g. a 20-min consult) don't have room for two
              // lines, so they get one compact line: start time + who.
              const compact = height < 46;
              return (
                <a key={a.id} className={`mgrid-appt${compact ? " compact" : ""}`} href={`/m/appt/${a.id}`} style={{ top, height, left: `${left}%`, width: `calc(${w}% - 3px)`, background: tint.bg, borderLeftColor: tint.bar }}>
                  {compact ? (
                    <span className="mgrid-appt-c"><b>{lblS.t}{lblS.ap}</b> {titleOf(a)}</span>
                  ) : (
                    <>
                      <span className="mgrid-appt-t">{timeRange}</span>
                      <span className="mgrid-appt-n">{titleOf(a)}</span>
                      {height > 66 && <span className="mgrid-appt-s">{subOf(a)} · {a.mode === "virtual" ? "Online" : "In person"}{a.billingSessionId ? " · ✓ logged" : ""}{showAll && a.clinicianId ? ` · ${lastName(clinName(a.clinicianId))}` : ""}</span>}
                    </>
                  )}
                </a>
              );
            })}
          </div>
          {dayList.length === 0 && dayBlocks.length === 0 && <div className="mgrid-empty">{viewingOwn ? <a href="/m/book">Nothing booked — tap + to add</a> : "Nothing booked"}</div>}
        </div>
      </div>

      {viewingOwn && <button className="mag-fab" onClick={() => setFabMenu(true)} aria-label="Add"><Ic n="plus" /></button>}

      {fabMenu && (
        <div className="mag-sheet-ov" onClick={() => setFabMenu(false)}>
          <div className="mag-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mag-sheet-grab" aria-hidden="true" />
            <div className="mag-acct-rows">
              <a className="mme-row" href={`/m/book?d=${selected}`}><span>Book an appointment</span><span className="mme-chev" aria-hidden="true">›</span></a>
              <a className="mme-row" href={`/m/block?d=${selected}`}><span>Block off time</span><span className="mme-chev" aria-hidden="true">›</span></a>
            </div>
          </div>
        </div>
      )}

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
              <a className="mme-row" href="/m/notifications"><span>Notifications{unread > 0 ? ` (${unread})` : ""}</span><span className="mme-chev" aria-hidden="true">›</span></a>
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
