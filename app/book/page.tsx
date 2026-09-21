import { CLINICIANS, publicBookableClinicians, isBookableClinician } from "@/lib/clinicians";
import { listAppointmentTypes, getSchedulingSettings } from "@/lib/scheduling";
import { listInsurers, getPracticeConfig } from "@/lib/billing";
import BookingFlow from "@/components/booking/BookingFlow";

export const dynamic = "force-dynamic";

const PREVIEW = "peek";

export default async function BookPage({ searchParams }: { searchParams: Promise<{ preview?: string; type?: string; clinician?: string }> }) {
  const sp = await searchParams;
  // Public booking. The page keeps passing the internal token to its own /api/book
  // routes (below), so a clean link like /book?clinician=shion just works.

  // Public picker + "any available". A private clinician (Nick) is added only
  // when reached by a direct ?clinician=<id> link, so he stays off the picker.
  const publicList = publicBookableClinicians();
  const requested = sp.clinician ? CLINICIANS.find((c) => c.id === sp.clinician && isBookableClinician(c)) : undefined;
  const bookable = requested && !publicList.some((c) => c.id === requested.id) ? [...publicList, requested] : publicList;

  const [types, insurers, cfg, settings] = await Promise.all([listAppointmentTypes(), listInsurers(), getPracticeConfig(), getSchedulingSettings()]);

  return (
    <BookingFlow
      practiceName={cfg.provider?.practiceName || "TIFEC · Essential Care"}
      welcome={settings.booking.welcome}
      accent={settings.booking.accent}
      policy={settings.booking.policy}
      types={types.filter((t) => t.active).map((t) => ({
        id: t.id, name: t.name, category: t.category, description: t.description, durationMin: t.durationMin, price: t.price,
        mode: t.mode, color: t.color, capacity: t.capacity, hasIntake: !!t.intakeFormKey, newClientIntakeOnly: t.newClientIntakeOnly, questions: t.questions,
      }))}
      clinicians={bookable.map((c) => ({ id: c.id, name: c.name, credentials: c.credentials, photo: c.photo }))}
      insurers={insurers.map((i) => ({ id: i.id, name: i.name }))}
      preview={PREVIEW}
      initialTypeId={sp.type}
      initialClinician={sp.clinician}
    />
  );
}
