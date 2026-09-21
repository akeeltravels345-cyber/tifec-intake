import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getBillingUser } from "@/lib/billingRole";
import { listAppointmentTypes } from "@/lib/scheduling";
import { seesAllSchedule, isTreatingClinician } from "../layout";
import BookingLinks from "@/components/scheduling/BookingLinks";

export const dynamic = "force-dynamic";

export default async function LinksPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/schedule/links");
  const me = user.clinician;
  if (!seesAllSchedule(me) && !isTreatingClinician(me)) redirect("/today");

  const [types, h] = await Promise.all([listAppointmentTypes(), headers()]);
  const active = types.filter((t) => t.active);
  // Order like the booking page: categories in first-seen order with Free Online
  // pinned first, then each service by its sort order, then name.
  const catOrder: string[] = [];
  for (const t of active) { const c = t.category.trim() || "Other"; if (!catOrder.includes(c)) catOrder.push(c); }
  catOrder.sort((a, b) => (/free online/i.test(b) ? 1 : 0) - (/free online/i.test(a) ? 1 : 0));
  const services = active
    .slice()
    .sort((a, b) => {
      const ca = catOrder.indexOf(a.category.trim() || "Other");
      const cb = catOrder.indexOf(b.category.trim() || "Other");
      if (ca !== cb) return ca - cb;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    })
    .map((t) => ({ id: t.id, name: t.name }));
  // Build the absolute origin on the server so the links render identically on
  // the client (no hydration mismatch) and copy/QR get shareable full URLs.
  const origin = process.env.APP_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;

  return (
    <div className="sh-wrap">
      <div className="sh-bar"><a className="sh-back" href="/schedule">← Back to my agenda</a></div>
      <BookingLinks clinicianId={me.id} clinicianName={me.name} types={services} origin={origin} />
    </div>
  );
}
