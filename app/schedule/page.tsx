import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { CLINICIANS } from "@/lib/clinicians";
import { listAppointmentTypes, listAppointments, getAvailability } from "@/lib/scheduling";
import { listInsurers } from "@/lib/billing";
import { caymanToday } from "@/lib/caymanTime";
import CalendarView from "@/components/scheduling/CalendarView";
import { seesAllSchedule, isTreatingClinician } from "./layout";

export const dynamic = "force-dynamic";

const bookable = CLINICIANS.filter((c) => !c.intakeHidden && c.contact !== "biller");
const CAY = 5;
const addDays = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const mondayOf = (d: string) => { const [y, m, dd] = d.split("-").map(Number); const w = (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7; return addDays(d, -w); };
const utcAtCayMidnight = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd, CAY, 0)).toISOString(); };

export default async function SchedulePage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/schedule");
  const me = user.clinician;
  const all = seesAllSchedule(me);
  if (!all && !isTreatingClinician(me)) redirect("/today");

  // Who the viewer can see: everyone (owner/Donnet/admin) or just themselves.
  const visible = all ? bookable : bookable.filter((c) => c.id === me.id);
  const today = caymanToday();
  const monday = mondayOf(today);

  const [types, insurers, appts, avails] = await Promise.all([
    listAppointmentTypes(),
    listInsurers(),
    listAppointments({ from: utcAtCayMidnight(monday), to: utcAtCayMidnight(addDays(monday, 7)), clinicianId: all ? undefined : me.id }),
    Promise.all(visible.map((c) => getAvailability(c.id))),
  ]);

  return (
    <CalendarView
      clinicians={visible.map((c) => ({ id: c.id, name: c.name }))}
      types={types}
      insurers={insurers.map((i) => ({ id: i.id, name: i.name }))}
      availabilities={avails.map((a) => ({ clinicianId: a.clinicianId, weekly: a.weekly, overrides: a.overrides }))}
      todayCayman={today}
      initial={appts}
      canEditAll={all}
      lockedClinicianId={all ? null : me.id}
    />
  );
}
