import { redirect } from "next/navigation";
import { inScheduleBeta } from "@/lib/clinicians";
import { getBillingUser } from "@/lib/billingRole";
import { listAppointments } from "@/lib/scheduling";
import { caymanToday } from "@/lib/caymanTime";
import MobileCalendar from "@/components/scheduling/MobileCalendar";

export const dynamic = "force-dynamic";

const CAY = 5;
const cayDate = (iso: string) => new Date(Date.parse(iso) - CAY * 3600e3).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const utcAtCayMidnight = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd, CAY, 0)).toISOString(); };

export default async function MobileCalendarPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/m/calendar");
  const me = user.clinician;
  if (!inScheduleBeta(me)) redirect("/today");

  const today = caymanToday();
  const appts = await listAppointments({ from: utcAtCayMidnight(addDays(today, -40)), to: utcAtCayMidnight(addDays(today, 95)), clinicianId: me.id });
  const daysWithAppts = [...new Set(appts.filter((a) => a.kind === "appointment" && a.status !== "cancelled").map((a) => cayDate(a.startAt)))];

  return <MobileCalendar daysWithAppts={daysWithAppts} today={today} />;
}
