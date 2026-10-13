import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin, getClinician } from "@/lib/clinicians";
import { schedulingStats } from "@/lib/scheduling";
import { caymanYearMonth } from "@/lib/caymanTime";
import MonthNav from "@/components/billing/MonthNav";

export const dynamic = "force-dynamic";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/scheduling/reports");
  // The practice owner manages scheduling config too, not only the admin account.
  if (!isSystemAdmin(user.clinician) && user.clinician.contact !== "owner") redirect("/today");

  const sp = await searchParams;
  const nowYM = caymanYearMonth();
  const year = Number(sp.y) || nowYM.year;
  const month = Number(sp.m) || nowYM.month;
  const s = await schedulingStats(year, month);

  const maxType = Math.max(1, ...s.popularTypes.map((t) => t.count));
  const maxClin = Math.max(1, ...s.byClinician.map((c) => c.count));
  const maxDow = Math.max(1, ...s.byWeekday);
  const maxSource = Math.max(1, ...s.bySource.map((x) => x.count));
  const maxChannel = Math.max(1, ...s.byChannel.map((x) => x.count));
  const hasMarketing = s.bySource.length > 0 || s.byChannel.length > 0;

  const Tile = ({ k, v, sub, tone }: { k: string; v: string | number; sub?: string; tone?: string }) => (
    <div className={`sr-tile ${tone || ""}`}><div className="sr-k">{k}</div><div className="sr-v">{v}</div>{sub && <div className="sr-s">{sub}</div>}</div>
  );

  return (
    <div className="sh-wrap">
      <div className="sh-bar"><a className="sh-back" href="/schedule">← Back to my agenda</a></div>
      <div className="sr">
        <div className="sr-head">
          <div>
            <h1 className="sr-h1">Scheduling insights</h1>
            <p className="sr-sub">Appointments, clients and no-shows for {MONTHS[month - 1]} {year}. Reads scheduling data only.</p>
          </div>
          <MonthNav year={year} month={month} path="/scheduling/reports" />
        </div>

        <div className="sr-tiles">
          <Tile k="Booked" v={s.total} sub={`${s.upcoming} upcoming · ${s.seen} seen`} />
          <Tile k="New clients" v={s.newClients} sub={`${s.returningClients} returning · ${s.totalClients} total`} tone="good" />
          <Tile k="No-shows" v={s.noShow} sub={`${s.noShowRate}% of kept`} tone={s.noShow ? "warn" : ""} />
          <Tile k="Cancelled" v={s.cancelled} sub={`${s.cancelRate}% of booked`} tone={s.cancelled ? "warn" : ""} />
          <Tile k="Self-booked" v={s.clientBookings} sub={`${s.staffBookings} by staff`} />
        </div>

        {s.total === 0 ? (
          <p className="sr-empty">No appointments in {MONTHS[month - 1]}. Book some on the calendar, or move to another month.</p>
        ) : (
          <div className="sr-cols">
            <div className="sr-card">
              <h2>Most popular services</h2>
              {s.popularTypes.map((t) => (
                <div key={t.typeId || "none"} className="sr-bar">
                  <span className="sr-barlabel">{t.name}</span>
                  <span className="sr-bartrack"><i style={{ width: `${(t.count / maxType) * 100}%`, background: t.color }} /></span>
                  <span className="sr-barval">{t.count}</span>
                </div>
              ))}
            </div>

            <div className="sr-card">
              <h2>By clinician</h2>
              {s.byClinician.map((c) => (
                <div key={c.clinicianId} className="sr-bar">
                  <span className="sr-barlabel">{getClinician(c.clinicianId)?.name || c.clinicianId}</span>
                  <span className="sr-bartrack"><i style={{ width: `${(c.count / maxClin) * 100}%` }} /></span>
                  <span className="sr-barval">{c.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="sr-card">
          <h2>Where clients come from</h2>
          {!hasMarketing ? (
            <p className="sr-sub" style={{ margin: 0 }}>
              Nothing yet for {MONTHS[month - 1]}. New clients are asked &ldquo;How did you hear about us?&rdquo; when they book online, and every online booking records the channel it came from (a link&rsquo;s <code>?utm_source=</code> / <code>?src=</code> tag, or the referring site). Returning clients aren&rsquo;t asked, and staff-entered bookings have no channel, so this fills in as new people book themselves.
            </p>
          ) : (
            <div className="sr-cols">
              <div>
                <h3 className="sr-subh">How did you hear about us? <span className="sr-sub">new clients</span></h3>
                {s.bySource.length === 0
                  ? <p className="sr-sub" style={{ margin: 0 }}>No new-client answers this month.</p>
                  : s.bySource.map((x) => (
                      <div key={x.source} className="sr-bar">
                        <span className="sr-barlabel">{x.source}</span>
                        <span className="sr-bartrack"><i style={{ width: `${(x.count / maxSource) * 100}%`, background: "var(--teal, #2f8e93)" }} /></span>
                        <span className="sr-barval">{x.count}</span>
                      </div>
                    ))}
              </div>
              <div>
                <h3 className="sr-subh">Booking channel <span className="sr-sub">auto-tracked</span></h3>
                {s.byChannel.length === 0
                  ? <p className="sr-sub" style={{ margin: 0 }}>No tracked channels this month.</p>
                  : s.byChannel.map((x) => (
                      <div key={x.channel} className="sr-bar">
                        <span className="sr-barlabel">{x.channel}</span>
                        <span className="sr-bartrack"><i style={{ width: `${(x.count / maxChannel) * 100}%`, background: "var(--indigo, #5b63b7)" }} /></span>
                        <span className="sr-barval">{x.count}</span>
                      </div>
                    ))}
              </div>
            </div>
          )}
        </div>

        {s.total > 0 && (
          <div className="sr-card">
            <h2>Bookings by weekday</h2>
            <div className="sr-week">
              {s.byWeekday.map((n, i) => (
                <div key={i} className="sr-daycol">
                  <div className="sr-daybar"><i style={{ height: `${(n / maxDow) * 100}%` }} /></div>
                  <div className="sr-daynum">{n}</div>
                  <div className="sr-dayname">{DOW[i]}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
