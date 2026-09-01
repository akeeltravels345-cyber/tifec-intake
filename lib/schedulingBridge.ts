// =============================================================================
// The seen -> billing bridge. When an appointment is marked "seen" AND the admin
// has turned the bridge on (scheduling settings, off by default), it creates a
// billing session from the appointment and links it back. This is the one place
// scheduling writes into billing, so it is gated and idempotent.
// =============================================================================

import { insertSession } from "./billing";
import { getAppointment, updateAppointment, listAppointmentTypes, getSchedulingSettings } from "./scheduling";

const CAY = 5; // Cayman UTC-5
const cayDate = (iso: string) => new Date(Date.parse(iso) - CAY * 3600e3).toISOString().slice(0, 10);

/** If the bridge is on and this seen appointment isn't already billed, make a
 *  billing session for it. Returns the session id, or null if nothing was done. */
export async function maybeBridgeSeen(appointmentId: string): Promise<string | null> {
  const settings = await getSchedulingSettings();
  if (!settings.bridge.seenToBilling) return null;

  const a = await getAppointment(appointmentId);
  if (!a || a.kind !== "appointment" || a.status !== "seen" || a.billingSessionId) return null;
  if (a.capacity > 1) return null; // group sessions would need one session per attendee — later

  const type = (await listAppointmentTypes()).find((t) => t.id === a.typeId);
  const parts = a.clientName.trim().split(/\s+/);
  const clientFirst = parts.length > 1 ? parts.slice(0, -1).join(" ") : (parts[0] || a.clientName);
  const clientLast = parts.length > 1 ? parts[parts.length - 1] : "";
  const durationHours = Math.max(0, (Date.parse(a.endAt) - Date.parse(a.startAt)) / 3600000);

  const session = await insertSession({
    clinicianId: a.clinicianId,
    clientFirst, clientLast, clientId: null,
    insurerId: a.insurancePath === "insurance" ? (a.insurerId || null) : null,
    dateOfService: cayDate(a.startAt),
    cptCodes: type?.baselineCptCodes ?? [],
    durationHours,
    totalCost: type?.price ?? 0,
    copayCollected: 0,
    notes: a.notes || "",
    createdBy: "scheduling",
  });
  await updateAppointment(a.id, { billingSessionId: session.id } as never);
  return session.id;
}
