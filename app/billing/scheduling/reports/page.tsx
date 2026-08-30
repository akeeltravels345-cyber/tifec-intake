import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin, getClinician } from "@/lib/clinicians";
import { schedulingStats } from "@/lib/scheduling";
import { caymanYearMonth } from "@/lib/caymanTime";
import SchedulingTabs from "@/components/billing/SchedulingTabs";
import MonthNav from "@/components/billing/MonthNav";

export const dynamic = "force-dynamic";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/scheduling/reports");
  if (!isSystemAdmin(user.clinician)) redirect("/today");

  const sp = await searchParams;
  const nowYM = caymanYearMonth();
  const year = Number(sp.y) || nowYM.year;
  const month = Number(sp.m) || nowYM.month;
  const s = await schedulingStats(year, month);

  const maxType = Math.max(1, ...s.popularTypes.map((t) => t.count));
  const maxClin = Math.max(1, ...s.byClinician.map((c) => c.count));
  const maxDow = Math.max(1, ...s.byWeekday);

  const Tile = ({ k, v, sub, tone }: { k: string; v: string | number; sub?: string; tone?: string }) => (
    <div className={`sr-tile ${tone || ""}`}><div className="sr-k">{k}</div><div className="sr-v">{v}</div>{sub && <div className="sr-s">{sub}</div>}</div>
  );

  return (
    <div>
      <SchedulingTabs />
      <div className="sr">
        <div className="sr-head">
          <div>
            <h1 className="sr-h1">Scheduling insights</h1>
            <p className="sr-sub">Appointments, clients and no-shows for {MONTHS[month - 1]} {year}. Reads scheduling data only.</p>
          </div>
          <MonthNav year={year} month={month} path="/billing/scheduling/reports" />
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
