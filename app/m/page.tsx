import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { inScheduleBeta, isBookableClinician, CLINICIANS } from "@/lib/clinicians";
import { getBillingUser } from "@/lib/billingRole";
import { listAppointmentTypes, listAppointments, getAvailability } from "@/lib/scheduling";
import { FORM_TEMPLATES } from "@/lib/forms";
import { listInsurers } from "@/lib/billing";
import { caymanToday } from "@/lib/caymanTime";
import CalendarView from "@/components/scheduling/CalendarView";
import { seesAllSchedule } from "../schedule/layout";

export const dynamic = "force-dynamic";

// Same treating roster + data as the web /schedule page — this is the phone-app
// view of the same calendar, reusing CalendarView (already mobile-first and
// carrying book / edit / cancel / log / share inline). The only differences:
// the availability link stays inside the mobile app (/m/hours), and the
// web/admin "More" links are hidden here (reach those via "Full app").
const bookable = CLINICIANS.filter((c) => isBookableClinician(c) && !c.test);
const CAY = 5;
const addDays = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const mondayOf = (d: string) => { const [y, m, dd] = d.split("-").map(Number); const w = (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7; return addDays(d, -w); };
const utcAtCayMidnight = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd, CAY, 0)).toISOString(); };

export default async function MobileSchedulePage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/m");
  const me = user.clinician;
  if (!inScheduleBeta(me)) redirect("/today");

  const canEditAll = seesAllSchedule(me);
  const visible = bookable;
  const defaultWho = visible.some((c) => c.id === me.id) ? me.id : null;
  const today = caymanToday();
  const monday = mondayOf(today);

  const [types, insurers, appts, avails, h] = await Promise.all([
    listAppointmentTypes(),
    listInsurers(),
    listAppointments({ from: utcAtCayMidnight(monday), to: utcAtCayMidnight(addDays(monday, 7)), clinicianId: defaultWho ?? undefined }),
    Promise.all(visible.map((c) => getAvailability(c.id))),
    headers(),
  ]);
  const origin = process.env.APP_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;

  return (
    <CalendarView
      clinicians={visible.map((c) => ({ id: c.id, name: c.name }))}
      types={types}
      insurers={insurers.map((i) => ({ id: i.id, name: i.name }))}
      availabilities={avails.map((a) => ({ clinicianId: a.clinicianId, weekly: a.weekly, overrides: a.overrides }))}
      todayCayman={today}
      initial={appts}
      canEditAll={canEditAll}
      lockedClinicianId={null}
      myClinicianId={me.id}
      defaultWho={defaultWho}
      origin={origin}
      hoursHref="/m/hours"
      setupHref={null}
      connectionsHref={null}
      statsHref={null}
      intakeHref={null}
      linksHref={null}
      servicesHref={null}
      bookingRulesHref={null}
      waitlistHref={null}
      insightsHref={null}
      intakeForms={Object.values(FORM_TEMPLATES).map((f) => ({ key: f.key, label: f.label }))}
    />
  );
}
