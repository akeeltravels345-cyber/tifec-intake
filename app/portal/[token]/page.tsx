import { readPortalToken } from "@/lib/portalAuth";
import { portalData, type PortalAppt } from "@/lib/portalData";

export const dynamic = "force-dynamic";

const BRAND = "The Institute for Essential Care";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bk-page">
      <div className="bk-shell">
        <header className="bk-head"><div className="bk-brand">{BRAND}</div><div className="bk-title">{title}</div></header>
        <section className="bk-sec">{children}</section>
      </div>
    </div>
  );
}

function ApptCard({ a, upcoming }: { a: PortalAppt; upcoming: boolean }) {
  return (
    <div className={`pt-card${a.intakeForms.length ? " needs" : ""}`}>
      <div className="pt-when">{a.whenText}</div>
      <div className="pt-svc">{a.serviceName}{a.isGroup ? " · Group session" : ""}</div>
      <div className="pt-meta">{a.clinicianName} · {a.mode === "virtual" ? "Online" : "In person"}</div>
      {upcoming && a.intakeForms.length > 0 && (
        <div className="pt-intake">
          <span className="pt-intake-lbl">Please complete before your visit:</span>
          <div className="pt-btns">
            {a.intakeForms.map((f) => <a key={f.url} className="pt-btn primary" href={f.url}>Complete your {f.label}</a>)}
          </div>
        </div>
      )}
      {upcoming && (
        <div className="pt-btns">
          {a.joinLink && <a className="pt-btn" href={a.joinLink} target="_blank" rel="noopener noreferrer">Join the video call</a>}
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
      <Shell title="My appointments">
        <h2 className="bk-h2">This link has expired</h2>
        <p className="bk-donesub">For your security, portal links expire. Request a fresh one and we&apos;ll email it to you.</p>
        <a className="bk-cta" href="/portal" style={{ display: "inline-block", textDecoration: "none" }}>Get a new link</a>
      </Shell>
    );
  }

  const data = await portalData(parsed.email);
  const firstName = (data.clientName || "").trim().split(/\s+/)[0];

  return (
    <Shell title="My appointments">
      <h2 className="bk-h2">Hello{firstName ? `, ${firstName}` : ""}</h2>
      <p className="bk-donesub">Here are your appointments with {BRAND}.</p>

      <div className="pt-sec">
        <h3 className="pt-h3">Upcoming</h3>
        {data.upcoming.length === 0
          ? <p className="bk-empty">You have no upcoming appointments. <a href="/book">Book one →</a></p>
          : data.upcoming.map((a) => <ApptCard key={a.id} a={a} upcoming />)}
      </div>

      {data.past.length > 0 && (
        <div className="pt-sec">
          <h3 className="pt-h3">Past</h3>
          {data.past.map((a) => <ApptCard key={a.id} a={a} upcoming={false} />)}
        </div>
      )}

      <p className="pt-foot">Need a new time? Use <a href="/book">our booking page</a>. Questions about payment or an invoice? Just reply to any email from us and we&apos;ll help.</p>
    </Shell>
  );
}
