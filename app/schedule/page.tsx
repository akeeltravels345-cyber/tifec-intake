import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { inScheduleBeta, isSystemAdmin, isBookableClinician } from "@/lib/clinicians";
import { getBillingUser } from "@/lib/billingRole";
import { CLINICIANS } from "@/lib/clinicians";
import { listAppointmentTypes, listAppointments, getAvailability } from "@/lib/scheduling";
import { FORM_TEMPLATES } from "@/lib/forms";
import { listInsurers } from "@/lib/billing";
import { caymanToday } from "@/lib/caymanTime";
import CalendarView from "@/components/scheduling/CalendarView";
import { seesAllSchedule, isTreatingClinician } from "./layout";

export const dynamic = "force-dynamic";

// Treating roster shown on the calendar: public clinicians PLUS private-booking
// practicum clinicians (e.g. Nick), but not test accounts.
const bookable = CLINICIANS.filter((c) => isBookableClinician(c) && !c.test);
const CAY = 5;
const addDays = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const mondayOf = (d: string) => { const [y, m, dd] = d.split("-").map(Number); const w = (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7; return addDays(d, -w); };
const utcAtCayMidnight = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd, CAY, 0)).toISOString(); };

export default async function SchedulePage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/schedule");
  const me = user.clinician;
  if (!inScheduleBeta(me)) redirect("/today");
  // EVERYONE sees the whole team's calendar now. Editing stays scoped: managers
  // (owner/admin/Donnet/Nick) can edit anyone's; everyone else edits only their
  // own appointments (enforced here AND server-side in /api/scheduling/appointments).
  const canEditAll = seesAllSchedule(me);

  const visible = bookable; // the whole treating roster is visible to all
  // Open on your own schedule when you're a treating clinician in the list; you
  // can still switch the filter to "All" or a colleague.
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
  // Absolute origin so the Share button hands out a full, shareable booking URL.
  const origin = process.env.APP_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;
  // Waitlist + insights are for the owner / system admin. Services and booking
  // rules are the owner's alone (per Dr. Shion's request) — the admin can still
  // reach those pages directly, just not via this menu.
  const manages = isSystemAdmin(me) || me.contact === "owner";
  const isOwner = me.contact === "owner";

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
      setupHref="/schedule/setup"
      hoursHref="/schedule/hours"
      connectionsHref="/schedule/connections"
      connectionsLabel="Connections"
      connectionsIcon="gear"
      statsHref="/schedule/stats"
      intakeHref="/schedule/intake"
      linksHref="/schedule/links"
      servicesHref={isOwner ? "/scheduling/types" : null}
      bookingRulesHref={isOwner ? "/scheduling/settings" : null}
      waitlistHref={manages ? "/scheduling/waitlist" : null}
      insightsHref={manages ? "/scheduling/reports" : null}
      intakeForms={Object.values(FORM_TEMPLATES).map((f) => ({ key: f.key, label: f.label }))}
    />
  );
}
