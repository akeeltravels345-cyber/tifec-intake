import { redirect } from "next/navigation";
import { inScheduleBeta } from "@/lib/clinicians";
import { getBillingUser } from "@/lib/billingRole";
import { listAppointmentTypes, listAppointments } from "@/lib/scheduling";
import { caymanToday } from "@/lib/caymanTime";
import MobileAgenda from "@/components/scheduling/MobileAgenda";

export const dynamic = "force-dynamic";

// The mobile "Today" agenda: the signed-in clinician's own day, as a swipeable
// date strip + a list of appointment cards. Same data + APIs as the web
// calendar — just a phone-native presentation. We load a generous window around
// today so the strip and day-to-day navigation feel instant.
const CAY = 5;
const addDays = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const mondayOf = (d: string) => { const [y, m, dd] = d.split("-").map(Number); const w = (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7; return addDays(d, -w); };
const utcAtCayMidnight = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd, CAY, 0)).toISOString(); };

export default async function MobileTodayPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/m");
  const me = user.clinician;
  if (!inScheduleBeta(me)) redirect("/today");

  const sp = await searchParams;
  const initialDay = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : undefined;
  const today = caymanToday();
  const monday = mondayOf(today);

  const [types, appts] = await Promise.all([
    listAppointmentTypes(),
    listAppointments({ from: utcAtCayMidnight(addDays(monday, -7)), to: utcAtCayMidnight(addDays(monday, 56)), clinicianId: me.id }),
  ]);

  // Lean shape for the client — only what the agenda renders.
  const lean = appts
    .filter((a) => a.kind === "appointment")
    .map((a) => ({
      id: a.id, startAt: a.startAt, endAt: a.endAt, clientName: a.clientName, typeId: a.typeId,
      mode: a.mode, status: a.status, capacity: a.capacity, locationOrLink: a.locationOrLink,
      billingSessionId: a.billingSessionId, intakeStatus: a.intakeStatus,
      insurancePath: a.insurancePath, insurerId: a.insurerId, seriesId: a.seriesId,
    }));

  return (
    <MobileAgenda
      appts={lean}
      types={types.map((t) => ({ id: t.id, name: t.name, mode: t.mode, capacity: t.capacity ?? 1 }))}
      todayCayman={today}
      initialDay={initialDay}
      clinicianName={me.name}
    />
  );
}
