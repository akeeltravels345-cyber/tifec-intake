import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin, CLINICIANS } from "@/lib/clinicians";
import { listAppointmentTypes, listAppointments } from "@/lib/scheduling";
import { listInsurers } from "@/lib/billing";
import { caymanToday } from "@/lib/caymanTime";
import SchedulingTabs from "@/components/billing/SchedulingTabs";
import CalendarView from "@/components/billing/CalendarView";

export const dynamic = "force-dynamic";

const bookable = CLINICIANS.filter((c) => !c.intakeHidden && c.contact !== "biller");

// Cayman = UTC-5 (fixed). Compute this week's UTC window from Cayman's Monday.
const CAY = 5;
const addDays = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const mondayOf = (d: string) => { const [y, m, dd] = d.split("-").map(Number); const w = (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7; return addDays(d, -w); };
const utcAtCayMidnight = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd, CAY, 0)).toISOString(); };

export default async function CalendarPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/scheduling/calendar");
  if (!isSystemAdmin(user.clinician)) redirect("/today");

  const today = caymanToday();
  const monday = mondayOf(today);
  const [types, insurers, appts] = await Promise.all([
    listAppointmentTypes(),
    listInsurers(),
    listAppointments({ from: utcAtCayMidnight(monday), to: utcAtCayMidnight(addDays(monday, 7)) }),
  ]);

  return (
    <div>
      <SchedulingTabs />
      <CalendarView
        clinicians={bookable.map((c) => ({ id: c.id, name: c.name }))}
        types={types.filter((t) => t.active)}
        insurers={insurers.map((i) => ({ id: i.id, name: i.name }))}
        todayCayman={today}
        initial={appts}
      />
    </div>
  );
}
