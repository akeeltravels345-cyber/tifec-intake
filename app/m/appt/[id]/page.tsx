import { redirect } from "next/navigation";
import { inScheduleBeta, getClinician } from "@/lib/clinicians";
import { getBillingUser } from "@/lib/billingRole";
import { getAppointment, listAppointmentTypes } from "@/lib/scheduling";
import { listInsurers } from "@/lib/billing";
import { requiredIntakeForms, formShortLabel } from "@/lib/intakeRouting";
import { seesAllSchedule } from "../../../schedule/layout";
import MobileApptDetail from "@/components/scheduling/MobileApptDetail";

export const dynamic = "force-dynamic";

const CAY = 5;
const cayShift = (iso: string) => new Date(Date.parse(iso) - CAY * 3600e3);
const time12 = (d: Date) => { let h = d.getUTCHours(); const m = d.getUTCMinutes(); const ap = h < 12 ? "am" : "pm"; h = h % 12 || 12; return `${h}${m ? ":" + String(m).padStart(2, "0") : ""}${ap}`; };
const dayLabel = (d: Date) => d.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });

export default async function MobileApptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getBillingUser();
  if (!user) redirect(`/login?next=/m/appt/${id}`);
  const me = user.clinician;
  if (!inScheduleBeta(me)) redirect("/today");

  const appt = await getAppointment(id);
  if (!appt || appt.kind !== "appointment") redirect("/m");
  const a = appt!;

  const [types, insurers] = await Promise.all([listAppointmentTypes(), listInsurers()]);
  const type = types.find((t) => t.id === a.typeId);
  const insurerName = a.insurerId ? (insurers.find((i) => i.id === a.insurerId)?.name ?? null) : null;

  const start = cayShift(a.startAt), end = cayShift(a.endAt);
  const durMin = Math.round((Date.parse(a.endAt) - Date.parse(a.startAt)) / 60000);
  const whenText = `${dayLabel(start)} · ${time12(start)}–${time12(end)}`;

  // Who booked it + when (Cayman), same wording as the web detail.
  const bookedBy = a.source === "client" ? "the client (online)"
    : a.createdBy === "acuity-import" ? "Acuity import"
    : !a.createdBy ? "staff"
    : (getClinician(a.createdBy)?.name || a.createdBy);
  const bookedOn = a.createdAt ? `${dayLabel(cayShift(a.createdAt))}, ${time12(cayShift(a.createdAt))}` : "";

  // The intake form(s) this service needs — powers the "Send intake" action.
  const reqForms = requiredIntakeForms(type?.name || "");
  const intakeForms = reqForms.map((f) => ({ key: f as string, label: formShortLabel(f) }));

  const canEdit = seesAllSchedule(me) || a.clinicianId === me.id;

  return (
    <MobileApptDetail
      appt={{
        id: a.id, clientName: a.clientName, clientEmail: a.clientEmail, mode: a.mode, status: a.status,
        capacity: a.capacity, locationOrLink: a.locationOrLink, billingSessionId: a.billingSessionId,
        intakeStatus: a.intakeStatus, insurancePath: a.insurancePath, seriesId: a.seriesId, startAtDate: start.toISOString().slice(0, 10),
      }}
      typeName={type?.name ?? "Appointment"}
      durMin={durMin}
      whenText={whenText}
      insurerName={insurerName}
      bookedBy={bookedBy}
      bookedOn={bookedOn}
      intakeForms={intakeForms}
      canEdit={canEdit}
    />
  );
}
