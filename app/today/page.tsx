import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { billingRoleOf, isOwner, isBiller, hasBillingBeta, devMode } from "@/lib/billingRole";
import { getSubmissionsByClinician } from "@/lib/db";
import { unreadCount, listTickets, unreadNotifications } from "@/lib/comms";
import { listSessions } from "@/lib/billing";
import { insurancePortion } from "@/lib/billingCalc";
import TodayViewAs from "@/components/billing/TodayViewAs";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const money2 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n: number) => Math.round(n * 100) / 100;
const firstName = (name: string) => name.replace(/^(Dr\.?|Mrs\.?|Mr\.?|Ms\.?|Miss)\s+/i, "").trim().split(/\s+/)[0];

// Line-stroke SVG icons, matching the app's icon vocabulary (BillingSidebar /
// DashboardShell) rather than emoji.
const svgIcon = (children: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const IC = {
  intake: svgIcon(<><path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1z" /><path d="M8 4H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" /><path d="M8 11h8M8 15h5" /></>),
  billing: svgIcon(<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4M4 6v12a2 2 0 0 0 2 2h14v-4" />),
  team: svgIcon(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />),
  setup: svgIcon(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>),
};

export default async function TodayPage() {
  const me = await getCurrentClinician();
  if (!me) redirect("/login?next=/today");

  const role = billingRoleOf(me);
  const owner = isOwner(role);
  const biller = isBiller(role);
  const hasBilling = hasBillingBeta(me);
  const admin = !!me.admin;

  // Intake: forms waiting to be looked at.
  const subs = await getSubmissionsByClinician(me.id);
  const needReview = subs.filter((s) => s.status === "new").length;

  // Team: unread messages + tickets waiting on this person.
  const [teamUnread, noteCount, tickets] = await Promise.all([unreadCount(me.id), unreadNotifications(me.id), listTickets()]);
  const openTickets = tickets.filter((t) => t.assignees.includes(me.id) && t.status !== "resolved").length;

  // Billing money position (only computed for people with billing access).
  let toBillPractice = 0, myToBill = 0;
  let pipe: { notBilled: number; withInsurers: number; inBank: number; total: number } | null = null;
  if (hasBilling) {
    const all = await listSessions();
    for (const s of all) {
      if (s.insurerId && !s.billedDate && !s.insurancePaid) {
        const ins = insurancePortion(s);
        toBillPractice += ins;
        if (s.clinicianId === me.id) myToBill += ins;
      }
    }
    toBillPractice = r2(toBillPractice); myToBill = r2(myToBill);

    if (owner) {
      const now = new Date();
      const mKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      let notBilled = 0, withInsurers = 0, inBank = 0;
      for (const s of all) {
        if (!(s.dateOfService || "").startsWith(mKey)) continue;
        if (!s.insurerId) { inBank += s.totalCost || 0; continue; }
        inBank += s.copayCollected || 0;
        const ins = insurancePortion(s);
        if (s.insurancePaid) inBank += ins;
        else if (s.billedDate) withInsurers += ins;
        else notBilled += ins;
      }
      pipe = { notBilled: r2(notBilled), withInsurers: r2(withInsurers), inBank: r2(inBank), total: r2(notBilled + withInsurers + inBank) };
    }
  }

  // The single most useful next action for this person.
  const startHere = owner
    ? { title: "Where the practice's money sits this month", body: "Every dollar charged is in one of three places below — nothing to reconcile.", href: "/billing/overview", cta: "Open the business overview" }
    : biller
      ? { title: toBillPractice > 0 ? `${money(toBillPractice)} of work is waiting to be billed` : "Nothing waiting to be billed", body: toBillPractice > 0 ? "Logged sessions that haven't been submitted to the insurer yet." : "You're all caught up on submissions.", href: "/billing/payments", cta: "Open the billing queue" }
      : needReview > 0
        ? { title: `${needReview} intake form${needReview === 1 ? "" : "s"} to review`, body: "New client paperwork waiting for you.", href: "/dashboard", cta: "Review intake" }
        : { title: "Log today's sessions", body: "Record what you saw so it flows into billing and your payout.", href: "/billing/sessions/new", cta: "Log a session" };

  // The areas this person can open (only what their roles give them).
  const areas: { label: string; desc: string; href: string; icon: ReactNode }[] = [
    { label: "Intake", desc: `${needReview > 0 ? `${needReview} to review · ` : ""}forms & submissions`, href: "/dashboard", icon: IC.intake },
  ];
  if (hasBilling) areas.push({ label: "Billing", desc: owner ? "Business overview & payouts" : biller ? "Queue, clients, reconcile" : "Your payout & clients", href: owner ? "/billing/overview" : biller ? "/billing/biller" : "/billing/me", icon: IC.billing });
  areas.push({ label: "Team", desc: `${teamUnread > 0 ? `${teamUnread} unread · ` : ""}notices, messages, tickets`, href: "/team", icon: IC.team });
  if (hasBilling) areas.push({ label: owner || biller ? "Setup" : "My setup", desc: owner || biller ? "Rates, insurers, codes" : "My expenses & agreement", href: owner || biller ? "/billing/config" : "/billing/me/setup", icon: IC.setup });

  // Needs attention — each deep-links to where it belongs.
  const attention: { label: string; href: string; tone?: "warn" }[] = [];
  if (needReview > 0) attention.push({ label: `${needReview} intake form${needReview === 1 ? "" : "s"} not yet reviewed`, href: "/dashboard" });
  if ((biller || owner) && toBillPractice > 0) attention.push({ label: `${money(toBillPractice)} of logged work not submitted to insurers`, href: "/billing/payments", tone: "warn" });
  if (!biller && !owner && hasBilling && myToBill > 0) attention.push({ label: `${money(myToBill)} of your work waiting to be billed`, href: "/billing/me" });
  if (openTickets > 0) attention.push({ label: `${openTickets} ${openTickets === 1 ? "ticket needs" : "tickets need"} you`, href: "/team/tickets", tone: "warn" });
  if (teamUnread > 0) attention.push({ label: `${teamUnread} unread message${teamUnread === 1 ? "" : "s"}`, href: "/team" });
  if (noteCount > 0) attention.push({ label: `${noteCount} notice${noteCount === 1 ? "" : "s"} on the board`, href: "/team" });

  const roleLabel = owner ? "Owner" : biller ? "Biller" : "Clinician";

  return (
    <div className="biz today-page">
      <div className="today-wrap">
        <header className="today-head">
          <div>
            <div className="today-brand"><img className="today-mark" src="/tifec-mark.png" alt="" /><span>TIFEC · Essential Care</span></div>
            <h1 className="today-h1">Hello, {firstName(me.name)}</h1>
            <p className="today-sub">Here&apos;s your day across intake, billing and the team.</p>
          </div>
          <div className="today-idwrap">
            <div className="today-id"><span className="today-role">{roleLabel}{admin ? " · Admin" : ""}</span><span className="today-name">{me.name}</span></div>
            {devMode() && <TodayViewAs />}
          </div>
        </header>

        {/* Start here */}
        <Link href={startHere.href} className="today-starthere">
          <div>
            <span className="today-sh-lab">Start here</span>
            <div className="today-sh-title">{startHere.title}</div>
            <div className="today-sh-body">{startHere.body}</div>
          </div>
          <span className="today-sh-cta">{startHere.cta} →</span>
        </Link>

        {/* Owner money pipeline */}
        {owner && pipe && (
          <div className="bo-card today-pipe">
            <div className="today-pipe-head"><span className="bo-lab">The practice this month</span><span className="today-pipe-total">{money2(pipe.total)} charged</span></div>
            <div className="today-bar">
              {pipe.total > 0 ? (<>
                <i style={{ width: `${(pipe.inBank / pipe.total) * 100}%`, background: "var(--teal)" }} />
                <i style={{ width: `${(pipe.withInsurers / pipe.total) * 100}%`, background: "var(--amber)" }} />
                <i style={{ width: `${(pipe.notBilled / pipe.total) * 100}%`, background: "#d8cbb0" }} />
              </>) : <i style={{ width: "100%", background: "var(--hair)" }} />}
            </div>
            <div className="today-pipe-cells">
              <div><span className="tp-dot" style={{ background: "#d8cbb0" }} />Not billed yet<b>{money2(pipe.notBilled)}</b></div>
              <div><span className="tp-dot" style={{ background: "var(--amber)" }} />With insurers<b>{money2(pipe.withInsurers)}</b></div>
              <div><span className="tp-dot" style={{ background: "var(--teal)" }} />In the bank<b>{money2(pipe.inBank)}</b></div>
            </div>
            <Link href="/billing/overview" className="today-pipe-link">Full P&amp;L, trend and by-clinician in the business overview →</Link>
            <Link href="/billing/payments" className="today-pipe-link" style={{ marginTop: 2 }}>Nick&apos;s queue handles the claim-by-claim submissions →</Link>
          </div>
        )}

        {/* Areas */}
        <div className="today-secrow"><span className="bo-lab">Your areas</span></div>
        <div className="today-areas">
          {areas.map((a) => (
            <Link key={a.label} href={a.href} className="today-area">
              <span className="today-area-ic">{a.icon}</span>
              <span className="today-area-name">{a.label}</span>
              <span className="today-area-desc">{a.desc}</span>
            </Link>
          ))}
        </div>

        {/* Needs attention */}
        {attention.length > 0 && (
          <>
            <div className="today-secrow"><span className="bo-lab">Needs attention</span></div>
            <div className="bo-card today-attn">
              {attention.map((a, i) => (
                <Link key={i} href={a.href} className={`today-attn-row${a.tone === "warn" ? " warn" : ""}`}>
                  <span className="today-attn-dot" />{a.label}<span className="today-attn-go">→</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
