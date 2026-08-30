import Link from "next/link";
import { caymanYearMonth } from "@/lib/caymanTime";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { billingRoleOf, isOwner, isBiller, hasBillingBeta, devMode } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import { getSubmissionsByClinician } from "@/lib/db";
import { unreadCount, listTickets, unreadNotifications } from "@/lib/comms";
import { listSessions, getPracticeConfig } from "@/lib/billing";
import { insurancePortion, collectedAtVisit, selfPayOutstanding, collectedInMonth } from "@/lib/billingCalc";
import UnifiedSidebar from "@/components/UnifiedSidebar";
import TodayPipeline, { type MonthPipe } from "@/components/TodayPipeline";
import Worklist from "@/components/today/Worklist";
import { listBuilderTasks, type BuilderTask } from "@/lib/builderTasks";
import { getSidebarData } from "@/lib/sidebarData";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const admin = isSystemAdmin(me);
  const hasBilling = hasBillingBeta(me);
  const sidebar = await getSidebarData(me);

  // Builder worklist: the admin's own task list, shown on Today for them alone.
  const worklist: BuilderTask[] = admin ? await listBuilderTasks(me.id, true) : [];

  // Intake: forms waiting to be looked at.
  const subs = await getSubmissionsByClinician(me.id);
  const needReview = subs.filter((s) => s.status === "new").length;

  // Team: unread messages + tickets waiting on this person.
  const [teamUnread, noteCount, tickets] = await Promise.all([unreadCount(me.id), unreadNotifications(me.id), listTickets()]);
  const openTickets = tickets.filter((t) => t.assignees.includes(me.id) && t.status !== "resolved").length;
  const openTicketsAll = tickets.filter((t) => t.status !== "resolved").length;

  // Billing money position (only computed for people with billing access).
  let toBillPractice = 0, myToBill = 0;
  let pipes: MonthPipe[] = [];
  // Admin (builder) processing-fee numbers: the platform fee is a % of cash
  // collected, so "outstanding" is that % of money still to be collected.
  let feePct = 0, collectedAll = 0, outstandingAll = 0;
  // Fee earned THIS month (the headline number), vs all-time (the history total).
  let feeThisMonth = 0, collectedThisMonth = 0, feeMonthLabel = "";
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

    if (admin) {
      feePct = (await getPracticeConfig()).processingFeePct ?? 0;
      for (const s of all) {
        // Cash already collected all-time (drives the fee history total).
        collectedAll += collectedAtVisit(s);
        if (s.insurerId && s.insurancePaid) collectedAll += insurancePortion(s);
        // Money still to come in (will generate fee when it lands).
        if (s.insurerId && !s.insurancePaid) outstandingAll += insurancePortion(s);
        outstandingAll += selfPayOutstanding(s);
      }
      collectedAll = r2(collectedAll); outstandingAll = r2(outstandingAll);
      const ym = caymanYearMonth();
      collectedThisMonth = collectedInMonth(all, ym.year, ym.month);
      feeThisMonth = r2((collectedThisMonth * feePct) / 100);
      feeMonthLabel = new Date(ym.year, ym.month - 1, 1).toLocaleString("en-US", { month: "long" });
    }

    if (owner) {
      // Every month that has activity, plus the current month — newest first,
      // capped so the swipeable card stays manageable.
      const nowYM = caymanYearMonth();
      const keys = new Set<string>([`${nowYM.year}-${String(nowYM.month).padStart(2, "0")}`]);
      for (const s of all) {
        const d = String(s.dateOfService || "");
        if (d.length >= 7) keys.add(d.slice(0, 7));
      }
      const monthKeys = [...keys].sort().reverse().slice(0, 12);
      pipes = monthKeys.map((mKey) => {
        let notBilled = 0, withInsurers = 0, inBank = 0;
        for (const s of all) {
          if (!String(s.dateOfService || "").startsWith(mKey)) continue;
          // Self-pay: only what's actually collected is in the bank; an unpaid
          // balance sits with "not billed yet" (owed) — a waive is simply neither.
          if (!s.insurerId) { inBank += collectedAtVisit(s); notBilled += selfPayOutstanding(s); continue; }
          inBank += s.copayCollected || 0;
          const ins = insurancePortion(s);
          if (s.insurancePaid) inBank += ins;
          else if (s.billedDate) withInsurers += ins;
          else notBilled += ins;
        }
        const [y, mo] = mKey.split("-").map(Number);
        const label = new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
        return { key: mKey, label, notBilled: r2(notBilled), withInsurers: r2(withInsurers), inBank: r2(inBank), total: r2(notBilled + withInsurers + inBank) };
      });
    }
  }

  const feeEarned = r2((collectedAll * feePct) / 100);
  const feeOutstanding = r2((outstandingAll * feePct) / 100);

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


  return (
    <div className="biz">
      <UnifiedSidebar data={sidebar} isDev={devMode()} />
      <main className="bo-main">
      <div className="today-wrap">
        <header className="today-head">
          <div>
            <h1 className="today-h1">Hello, {firstName(me.name)}</h1>
            <p className="today-sub">Here&apos;s your day across intake, billing and the team.</p>
          </div>
        </header>

        {/* Start here — hidden for the builder/admin, who doesn't need the
            "where the money sits" nudge. Everyone else still gets it. */}
        {!admin && (
          <Link href={startHere.href} className="today-starthere">
            <div>
              <span className="today-sh-lab">Start here</span>
              <div className="today-sh-title">{startHere.title}</div>
              <div className="today-sh-body">{startHere.body}</div>
            </div>
            <span className="today-sh-cta">{startHere.cta} →</span>
          </Link>
        )}

        {/* Admin (builder) numbers — your processing-fee take + your tickets */}
        {admin && (
          <>
            <div className="today-secrow"><span className="bo-lab">Your numbers</span></div>
            <div className="today-nums">
              <Link href="/billing/fees" className="today-num link">
                <div className="k">Fee earned this month</div>
                <div className="v">{money(feeThisMonth)}</div>
                <div className="s">{feePct}% of {money(collectedThisMonth)} collected in {feeMonthLabel} · history →</div>
              </Link>
              <div className="today-num owe">
                <div className="k">Fee still to come</div>
                <div className="v">{money(feeOutstanding)}</div>
                <div className="s">{feePct}% of {money(outstandingAll)} not yet collected</div>
              </div>
              <div className="today-num total">
                <div className="k">Total when all settles</div>
                <div className="v">{money(r2(feeEarned + feeOutstanding))}</div>
                <div className="s">earned + outstanding</div>
              </div>
              <Link href="/team/tickets" className="today-num link">
                <div className="k">Tickets on you</div>
                <div className="v">{openTickets}</div>
                <div className="s">{openTicketsAll} open across the team →</div>
              </Link>
            </div>
            {feePct === 0 && <p className="today-feenote">Set your platform processing fee % in <Link href="/billing/config">Setup</Link> to see these fill in.</p>}
          </>
        )}

        {/* Builder worklist — admin only */}
        {admin && <Worklist initial={worklist} />}

        {/* Owner money pipeline — swipeable by month */}
        {owner && pipes.length > 0 && <TodayPipeline months={pipes} />}

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
      </main>
    </div>
  );
}
