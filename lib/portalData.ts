// Everything the client portal shows for one email: their upcoming and past
// appointments (direct bookings and group sessions they're on the roster for),
// with intake status and links back into the existing manage / intake flows.
import { listAppointments, listAppointmentTypes, type Appointment } from "@/lib/scheduling";
import { getClinician } from "@/lib/clinicians";
import { assessClientIntake, intakeLinkPath, formShortLabel } from "@/lib/intakeRouting";
import { caymanWhen } from "@/lib/caymanTime";

const PREVIEW = "peek";

export interface PortalAppt {
  id: string;
  serviceName: string;
  clinicianName: string;
  whenText: string;
  startAt: string;
  mode: string;
  isGroup: boolean;
  status: string;
  joinLink: string;      // video link for a virtual booking, else ""
  intakeForms: { label: string; url: string }[]; // outstanding intake (upcoming only)
  manageUrl: string;     // reuse the existing per-booking manage page ("" for group seats)
}

export interface PortalData {
  clientName: string;
  upcoming: PortalAppt[];
  past: PortalAppt[];
}

const emailMatches = (a: Appointment, email: string) =>
  a.clientEmail.trim().toLowerCase() === email || (a.attendees || []).some((x) => x.email.trim().toLowerCase() === email);

const nameFor = (a: Appointment, email: string) =>
  a.clientEmail.trim().toLowerCase() === email ? a.clientName : ((a.attendees || []).find((x) => x.email.trim().toLowerCase() === email)?.name || a.clientName);

/** Assemble the portal view for one (already-authenticated) email. */
export async function portalData(email: string): Promise<PortalData> {
  const e = email.trim().toLowerCase();
  if (!e) return { clientName: "", upcoming: [], past: [] };
  const [all, types] = await Promise.all([listAppointments({}), listAppointmentTypes()]);
  const mine = all.filter((a) => a.kind === "appointment" && a.status !== "cancelled" && emailMatches(a, e));
  const now = Date.now();
  let clientName = "";

  const build = async (a: Appointment, upcoming: boolean): Promise<PortalAppt> => {
    const type = types.find((t) => t.id === a.typeId);
    const isGroup = (a.capacity || 1) > 1;
    const name = nameFor(a, e);
    if (name && !clientName) clientName = name;
    let intakeForms: PortalAppt["intakeForms"] = [];
    if (upcoming && a.intakeStatus === "pending" && type) {
      const assess = await assessClientIntake(name, type.name, e);
      if (assess.needsIntake) {
        intakeForms = assess.missingForms.map((f) => ({ label: formShortLabel(f), url: intakeLinkPath(a.clinicianId, f, a.coupleId || undefined) }));
      }
    }
    const isLink = /^https?:\/\//.test(a.locationOrLink || "");
    return {
      id: a.id,
      serviceName: type?.name || "Appointment",
      clinicianName: getClinician(a.clinicianId)?.name || "your clinician",
      whenText: caymanWhen(a.startAt),
      startAt: a.startAt,
      mode: a.mode,
      isGroup,
      status: a.status,
      joinLink: a.mode === "virtual" && isLink ? a.locationOrLink : "",
      intakeForms,
      // Group seats don't get a self-cancel link (it would drop the whole session).
      manageUrl: isGroup ? "" : `/book/manage?preview=${PREVIEW}&id=${a.id}`,
    };
  };

  const upcomingAppts = mine.filter((a) => Date.parse(a.startAt) >= now).sort((a, b) => a.startAt.localeCompare(b.startAt));
  const pastAppts = mine.filter((a) => Date.parse(a.startAt) < now).sort((a, b) => b.startAt.localeCompare(a.startAt)).slice(0, 20);

  const upcoming = await Promise.all(upcomingAppts.map((a) => build(a, true)));
  const past = await Promise.all(pastAppts.map((a) => build(a, false)));
  return { clientName, upcoming, past };
}

/** True if we hold any appointment for this email (used to decide whether to
 *  email a magic link — without revealing the answer to the requester). */
export async function hasAppointmentsFor(email: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  if (!e) return false;
  const all = await listAppointments({});
  return all.some((a) => a.kind === "appointment" && emailMatches(a, e));
}
