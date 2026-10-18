import { redirect } from "next/navigation";
import { inScheduleBeta } from "@/lib/clinicians";
import { getBillingUser } from "@/lib/billingRole";
import { getAppointment, listAppointmentTypes } from "@/lib/scheduling";
import { seesAllSchedule } from "../../../../schedule/layout";
import MobileApptEdit from "@/components/scheduling/MobileApptEdit";

export const dynamic = "force-dynamic";

const CAY = 5;
const cayDate = (iso: string) => new Date(Date.parse(iso) - CAY * 3600e3).toISOString().slice(0, 10);
const cayHM = (iso: string) => { const d = new Date(Date.parse(iso) - CAY * 3600e3); return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };

export default async function MobileApptEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getBillingUser();
  if (!user) redirect(`/login?next=/m/appt/${id}/edit`);
  const me = user.clinician;
  if (!inScheduleBeta(me)) redirect("/today");

  const appt = await getAppointment(id);
  if (!appt || appt.kind !== "appointment") redirect("/m");
  if (!(seesAllSchedule(me) || appt.clinicianId === me.id)) redirect(`/m/appt/${id}`);

  const types = (await listAppointmentTypes())
    .filter((t) => (t as { active?: boolean }).active !== false)
    .map((t) => ({ id: t.id, name: t.name, durationMin: t.durationMin ?? 50, mode: t.mode, category: t.category || "Other" }));

  return (
    <MobileApptEdit
      id={appt.id}
      types={types}
      initial={{ clientName: appt.clientName, clientEmail: appt.clientEmail, typeId: appt.typeId, mode: appt.mode, date: cayDate(appt.startAt), time: cayHM(appt.startAt), notes: appt.notes }}
    />
  );
}
