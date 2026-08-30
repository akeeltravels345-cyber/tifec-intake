import { notFound } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { isSystemAdmin, CLINICIANS } from "@/lib/clinicians";
import { listAppointmentTypes, getSchedulingSettings } from "@/lib/scheduling";
import { listInsurers, getPracticeConfig } from "@/lib/billing";
import BookingFlow from "@/components/booking/BookingFlow";

export const dynamic = "force-dynamic";

const PREVIEW = "peek";
const bookable = CLINICIANS.filter((c) => !c.intakeHidden && c.contact !== "biller");

export default async function BookPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const sp = await searchParams;
  // Prototype: unlisted. Visible only with the preview token, or to the admin.
  const me = await getCurrentClinician();
  if (sp.preview !== PREVIEW && !(me && isSystemAdmin(me))) notFound();

  const [types, insurers, cfg, settings] = await Promise.all([listAppointmentTypes(), listInsurers(), getPracticeConfig(), getSchedulingSettings()]);

  return (
    <BookingFlow
      practiceName={cfg.provider?.practiceName || "TIFEC · Essential Care"}
      welcome={settings.booking.welcome}
      accent={settings.booking.accent}
      types={types.filter((t) => t.active).map((t) => ({
        id: t.id, name: t.name, category: t.category, durationMin: t.durationMin, price: t.price,
        mode: t.mode, color: t.color, hasIntake: !!t.intakeFormKey, newClientIntakeOnly: t.newClientIntakeOnly,
      }))}
      clinicians={bookable.map((c) => ({ id: c.id, name: c.name, credentials: c.credentials }))}
      insurers={insurers.map((i) => ({ id: i.id, name: i.name }))}
      preview={PREVIEW}
    />
  );
}
