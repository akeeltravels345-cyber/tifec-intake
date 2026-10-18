import { redirect } from "next/navigation";
import { inScheduleBeta } from "@/lib/clinicians";
import { getBillingUser } from "@/lib/billingRole";
import { listAppointments, listAppointmentTypes } from "@/lib/scheduling";
import { caymanToday } from "@/lib/caymanTime";
import MobileCalendar from "@/components/scheduling/MobileCalendar";

export const dynamic = "force-dynamic";

const CAY = 5;
const addDays = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const utcAtCayMidnight = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd, CAY, 0)).toISOString(); };

export default async function MobileCalendarPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/m/calendar");
  const me = user.clinician;
  if (!inScheduleBeta(me)) redirect("/today");

  const today = caymanToday();
  const [types, appts] = await Promise.all([
    listAppointmentTypes(),
    listAppointments({ from: utcAtCayMidnight(addDays(today, -62)), to: utcAtCayMidnight(addDays(today, 125)), clinicianId: me.id }),
  ]);
  const lean = appts
    .filter((a) => a.kind === "appointment")
    .map((a) => ({ id: a.id, startAt: a.startAt, endAt: a.endAt, clientName: a.clientName, typeId: a.typeId, mode: a.mode, status: a.status, capacity: a.capacity, billingSessionId: a.billingSessionId, intakeStatus: a.intakeStatus }));

  return <MobileCalendar appts={lean} types={types.map((t) => ({ id: t.id, name: t.name, capacity: t.capacity ?? 1 }))} today={today} />;
}
