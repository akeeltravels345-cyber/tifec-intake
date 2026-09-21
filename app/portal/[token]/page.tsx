import { readPortalToken } from "@/lib/portalAuth";
import { portalData, type PortalAppt } from "@/lib/portalData";

export const dynamic = "force-dynamic";

const BRAND = "The Institute for Essential Care";
const CAY = "America/Cayman";
const fmtDate = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: CAY, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
const fmtTime = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: CAY, hour: "numeric", minute: "2-digit" }).format(new Date(iso));

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt">
      <div className="pt-inner">
        <header className="pt-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pt-logo" src="/tifec-mark.png" alt="" />
          <div className="pt-brand">{BRAND}</div>
          <h1 className="pt-title">My appointments</h1>
        </header>
        {children}
      </div>
    </div>
  );
}

function Appt({ a, upcoming }: { a: PortalAppt; upcoming: boolean }) {
  return (
    <div className={`pt-item${upcoming ? "" : " past"}`}>
      <div className="pt-when">
        <span className="pt-date">{fmtDate(a.startAt)}</span>
        <span className="pt-time">{fmtTime(a.startAt)}</span>
        <span className="pt-mode">{a.mode === "virtual" ? "Online" : "In person"}{a.isGroup ? " · Group" : ""}</span>
      </div>
      <div className="pt-svc">{a.serviceName}</div>
      <div className="pt-clin">{a.clinicianName}</div>

      {upcoming && a.intakeForms.length > 0 && (
        <div className="pt-intake">
          <div className="pt-intake-lbl">Please complete before your visit</div>
          <div className="pt-links">
            {a.intakeForms.map((f) => <a key={f.url} className="pt-link" href={f.url}>{f.label}</a>)}
          </div>
        </div>
      )}

      {upcoming && (
        <div className="pt-actions">
          {a.joinLink && <a className="pt-btn accent" href={a.joinLink} target="_blank" rel="noopener noreferrer">Join video call</a>}
          {a.manageUrl
            ? <a className="pt-btn" href={a.manageUrl}>Reschedule or cancel</a>
            : <span className="pt-note">To change a group seat, reply to your confirmation email.</span>}
        </div>
      )}
    </div>
  );
}

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = readPortalToken(token);
  if (!parsed) {
    return (
      <Shell>
        <p className="pt-hi">This link has expired. For your security, portal links don&apos;t last forever.</p>
        <a className="pt-btn accent" href="/portal" style={{ marginTop: 4 }}>Get a new link</a>
      </Shell>
    );
  }

  const data = await portalData(parsed.email);
  const firstName = (data.clientName || "").trim().split(/\s+/)[0];

  return (
    <Shell>
      <p className="pt-hi">{firstName ? `Hello, ${firstName}.` : "Hello."} Here&apos;s everything on your calendar with us.</p>

      <div className="pt-group">
        <div className="pt-label">Upcoming</div>
        {data.upcoming.length === 0
          ? <p className="pt-empty">Nothing coming up. <a className="pt-a" href="/book">Book an appointment</a>.</p>
          : data.upcoming.map((a) => <Appt key={a.id} a={a} upcoming />)}
      </div>

      {data.past.length > 0 && (
        <div className="pt-group">
          <div className="pt-label">Past</div>
          {data.past.map((a) => <Appt key={a.id} a={a} upcoming={false} />)}
        </div>
      )}

      <p className="pt-foot">Need a new time? Visit <a className="pt-a" href="/book">our booking page</a>. Questions about payment or an invoice? Just reply to any email from us.</p>
    </Shell>
  );
}
