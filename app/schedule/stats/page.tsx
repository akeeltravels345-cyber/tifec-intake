import { redirect } from "next/navigation";
import { inScheduleBeta } from "@/lib/clinicians";
import { getBillingUser } from "@/lib/billingRole";
import { getClinician, CLINICIANS } from "@/lib/clinicians";
import { schedulingStats, monthlyCapacityMinutes } from "@/lib/scheduling";
import { caymanYearMonth } from "@/lib/caymanTime";
import MonthNav from "@/components/billing/MonthNav";
import { seesAllSchedule, isTreatingClinician } from "../layout";

export const dynamic = "force-dynamic";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/schedule/stats");
  const me = user.clinician;
  const all = seesAllSchedule(me);
  if (!inScheduleBeta(me)) redirect("/today");

  const sp = await searchParams;
  const nowYM = caymanYearMonth();
  const year = Number(sp.y) || nowYM.year;
  const month = Number(sp.m) || nowYM.month;
  // Owner / Donnet / admin see the whole practice; a clinician sees just their own.
  const scopeId = all ? undefined : me.id;
  // Clinicians whose hours make up the capacity denominator for utilization.
  const treats = (c: typeof CLINICIANS[number]) => !!c.test || (!c.intakeHidden && c.contact !== "biller" && c.contact !== "admin");
  const capacityIds = all ? CLINICIANS.filter(treats).map((c) => c.id) : [me.id];
  const [s, capacityMin] = await Promise.all([
    schedulingStats(year, month, scopeId),
    monthlyCapacityMinutes(capacityIds, year, month),
  ]);
  const utilization = capacityMin > 0 ? Math.round((s.bookedMinutes / capacityMin) * 1000) / 10 : 0;
  const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  const hrs = (min: number) => `${Math.round(min / 6) / 10}h`;

  const maxType = Math.max(1, ...s.popularTypes.map((t) => t.count));
  const maxClin = Math.max(1, ...s.byClinician.map((c) => c.count));
  const maxDow = Math.max(1, ...s.byWeekday);
  const busiestIdx = s.byWeekday.reduce((best, n, i) => (n > s.byWeekday[best] ? i : best), 0);
  const scopeLabel = all ? "the whole practice" : "you";

  const Tile = ({ k, v, sub, tone }: { k: string; v: string | number; sub?: string; tone?: string }) => (
    <div className={`sr-tile ${tone || ""}`}><div className="sr-k">{k}</div><div className="sr-v">{v}</div>{sub && <div className="sr-s">{sub}</div>}</div>
  );

  return (
    <div className="sh-wrap">
      <div className="sh-bar"><a className="sh-back" href="/schedule">← Back to my agenda</a></div>
      <div className="sr">
        <div className="sr-head">
          <div>
            <h1 className="sr-h1">Your month at a glance</h1>
            <p className="sr-sub">Appointments and clients for {scopeLabel} in {MONTHS[month - 1]} {year}.</p>
          </div>
          <MonthNav year={year} month={month} path="/schedule/stats" />
        </div>

        {s.total === 0 ? (
          <p className="sr-empty">No appointments in {MONTHS[month - 1]} yet. They&apos;ll show here as they&apos;re booked, or pick another month.</p>
        ) : (
          <>
            <div className="sr-tiles">
              <Tile k="Booked this month" v={s.total} sub={`${s.upcoming} upcoming · ${s.seen} seen`} />
              <Tile k="Utilization" v={`${utilization}%`} sub={capacityMin > 0 ? `${hrs(s.bookedMinutes)} of ${hrs(capacityMin)} booked` : "Set your hours to track this"} tone={utilization >= 70 ? "good" : ""} />
              <Tile k="Booked value" v={money(s.bookedValue)} sub={`${money(s.seenValue)} from sessions seen`} />
              <Tile k="New clients" v={s.newClients} sub={`${s.returningClients} returning · ${s.totalClients} total`} tone="good" />
              <Tile k="Booked online" v={s.clientBookings} sub={`${s.staffBookings} added by staff`} />
              <Tile k="No-shows" v={s.noShow} sub={`${s.noShowRate}% of kept`} tone={s.noShow ? "warn" : ""} />
              <Tile k="Cancelled" v={s.cancelled} sub={`${s.cancelRate}% of booked`} tone={s.cancelled ? "warn" : ""} />
            </div>

            <div className="sr-cols">
              <div className="sr-card">
                <h2>Most popular services</h2>
                {s.popularTypes.slice(0, 8).map((t) => (
                  <div key={t.typeId || "none"} className="sr-bar">
                    <span className="sr-barlabel">{t.name}</span>
                    <span className="sr-bartrack"><i style={{ width: `${(t.count / maxType) * 100}%`, background: t.color }} /></span>
                    <span className="sr-barval">{t.count}</span>
                  </div>
                ))}
              </div>

              {all && s.byClinician.length > 1 && (
                <div className="sr-card">
                  <h2>By clinician</h2>
                  {s.byClinician.map((c) => (
                    <div key={c.clinicianId} className="sr-bar">
                      <span className="sr-barlabel">{getClinician(c.clinicianId)?.name || "Other / former"}</span>
                      <span className="sr-bartrack"><i style={{ width: `${(c.count / maxClin) * 100}%` }} /></span>
                      <span className="sr-barval">{c.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="sr-card">
              <h2>Bookings by weekday</h2>
              <div className="sr-week">
                {s.byWeekday.map((n, i) => (
                  <div key={i} className={`sr-daycol${i === busiestIdx && n > 0 ? " busiest" : ""}`}>
                    <div className="sr-daybar"><i style={{ height: `${(n / maxDow) * 100}%` }} /></div>
                    <div className="sr-daynum">{n}</div>
                    <div className="sr-dayname">{DOW[i]}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
