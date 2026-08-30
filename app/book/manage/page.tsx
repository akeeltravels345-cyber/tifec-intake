import { notFound } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { isSystemAdmin, getClinician } from "@/lib/clinicians";
import { getAppointment, listAppointmentTypes } from "@/lib/scheduling";
import { getPracticeConfig } from "@/lib/billing";
import ManageBooking from "@/components/booking/ManageBooking";

export const dynamic = "force-dynamic";

const PREVIEW = "peek";

export default async function ManagePage({ searchParams }: { searchParams: Promise<{ preview?: string; id?: string }> }) {
  const sp = await searchParams;
  const me = await getCurrentClinician();
  if (sp.preview !== PREVIEW && !(me && isSystemAdmin(me))) notFound();

  const a = sp.id ? await getAppointment(sp.id) : null;
  if (!a || a.kind !== "appointment") notFound();

  const [types, cfg] = await Promise.all([listAppointmentTypes(), getPracticeConfig()]);
  const type = types.find((t) => t.id === a.typeId);

  return (
    <ManageBooking
      preview={PREVIEW}
      practiceName={cfg.provider?.practiceName || "TIFEC · Essential Care"}
      initial={{
        id: a.id, service: type?.name || "Appointment", typeId: a.typeId,
        durationMin: type?.durationMin || Math.round((Date.parse(a.endAt) - Date.parse(a.startAt)) / 60000),
        clinicianId: a.clinicianId, clinicianName: getClinician(a.clinicianId)?.name || "",
        clientName: a.clientName, startAt: a.startAt, endAt: a.endAt, mode: a.mode, status: a.status,
      }}
    />
  );
}
