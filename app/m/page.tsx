import { redirect } from "next/navigation";
import { inScheduleBeta, isBookableClinician, CLINICIANS } from "@/lib/clinicians";
import { getBillingUser } from "@/lib/billingRole";
import { listAppointmentTypes, listAppointments } from "@/lib/scheduling";
import { caymanToday } from "@/lib/caymanTime";
import MobileAgenda from "@/components/scheduling/MobileAgenda";

export const dynamic = "force-dynamic";

// The whole treating roster — everyone can VIEW any colleague's schedule (or
// Everyone). Editing stays gated to your own appointments on the detail screen.
const roster = CLINICIANS.filter((c) => isBookableClinician(c) && !c.test).map((c) => ({ id: c.id, name: c.name }));

// The mobile "Today" agenda: the signed-in clinician's own day, as a swipeable
// date strip + a list of appointment cards. Same data + APIs as the web
// calendar — just a phone-native presentation. We load a generous window around
// today so the strip and day-to-day navigation feel instant.
const CAY = 5;
const addDays = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const mondayOf = (d: string) => { const [y, m, dd] = d.split("-").map(Number); const w = (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7; return addDays(d, -w); };
const utcAtCayMidnight = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd, CAY, 0)).toISOString(); };

export default async function MobileTodayPage({ searchParams }: { searchParams: Promise<{ d?: string; who?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/m");
  const me = user.clinician;
  if (!inScheduleBeta(me)) redirect("/today");

  const sp = await searchParams;
  const initialDay = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : undefined;
  // Whose schedule: "all", a colleague's id, or (default) my own.
  const who = sp.who === "all" ? "all" : (roster.some((c) => c.id === sp.who) ? sp.who! : me.id);
  const forClinician = who === "all" ? undefined : who;
  const today = caymanToday();
  const monday = mondayOf(today);

  const [types, appts] = await Promise.all([
    listAppointmentTypes(),
    listAppointments({ from: utcAtCayMidnight(addDays(monday, -7)), to: utcAtCayMidnight(addDays(monday, 56)), clinicianId: forClinician }),
  ]);

  // Lean shape for the client — appointments AND blocks (grey bands on the grid).
  const lean = appts.map((a) => ({
    id: a.id, startAt: a.startAt, endAt: a.endAt, clientName: a.clientName, typeId: a.typeId,
    mode: a.mode, status: a.status, capacity: a.capacity, locationOrLink: a.locationOrLink,
    billingSessionId: a.billingSessionId, intakeStatus: a.intakeStatus, clinicianId: a.clinicianId,
    insurancePath: a.insurancePath, insurerId: a.insurerId, seriesId: a.seriesId,
    kind: a.kind, title: a.title,
  }));

  return (
    <MobileAgenda
      appts={lean}
      types={types.map((t) => ({ id: t.id, name: t.name, mode: t.mode, capacity: t.capacity ?? 1 }))}
      todayCayman={today}
      initialDay={initialDay}
      clinicians={roster}
      who={who}
      myId={me.id}
    />
  );
}
