import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getClinician } from "@/lib/clinicians";
import {
  listAppointmentTypes, createAppointment, hasConflict, getWaitlistEntry, setWaitlistStatus,
  type Appointment,
} from "@/lib/scheduling";
import { getOffer, winOffer, setOfferAppt, readClaimToken } from "@/lib/waitlistOffers";
import { attachVideoAndCalendar, sendIntakeInvite, sendBookingConfirmation } from "@/lib/bookingCore";
import { portalToken } from "@/lib/portalAuth";
import { assessClientIntake, intakeLinkPath, formShortLabel } from "@/lib/intakeRouting";
import { caymanWhen } from "@/lib/caymanTime";

export const dynamic = "force-dynamic";

const PREVIEW = "peek";
const phoneFromNote = (note: string) => (note.match(/(\+?[\d][\d\s()-]{6,})/)?.[1] || "").trim();

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }

  const parsed = readClaimToken(String(body.token || ""));
  if (!parsed) return NextResponse.json({ error: "This link isn't valid." }, { status: 400 });

  const offer = await getOffer(parsed.offerId);
  if (!offer) return NextResponse.json({ error: "This offer could not be found." }, { status: 404 });
  if (offer.status !== "open" || Date.parse(offer.expiresAt) <= Date.now()) {
    return NextResponse.json({ error: "taken", message: "Sorry, this time has already been taken. You're still on the waitlist for the next opening." }, { status: 409 });
  }

  const entry = await getWaitlistEntry(parsed.entryId);
  if (!entry || !entry.email) return NextResponse.json({ error: "We couldn't find your waitlist entry." }, { status: 404 });

  const type = offer.typeId ? (await listAppointmentTypes()).find((t) => t.id === offer.typeId) : null;
  const durationMin = type?.durationMin || Math.round((Date.parse(offer.endAt) - Date.parse(offer.startAt)) / 60000);
  const serviceName = type?.name || "Appointment";
  const clinicianName = getClinician(offer.clinicianId)?.name || "your clinician";

  // Make sure staff (or a faster booking) didn't take the slot in the meantime.
  if (await hasConflict(offer.clinicianId, offer.startAt, offer.endAt)) {
    return NextResponse.json({ error: "taken", message: "Sorry, this time was just booked. You're still on the waitlist for the next opening." }, { status: 409 });
  }

  // Atomic: only one claimant flips the offer to claimed and books the slot.
  if (!(await winOffer(offer.id, entry.id))) {
    return NextResponse.json({ error: "taken", message: "Sorry, someone just claimed this time. You're still on the waitlist for the next opening." }, { status: 409 });
  }

  // New-client intake for this waitlister, same rules as a normal booking.
  const assessment = await assessClientIntake(entry.name, serviceName, entry.email);
  const needsIntake = assessment.requiredForms.length > 0 && assessment.missingForms.length > 0;
  const intakeStatus = assessment.requiredForms.length === 0 ? "not_required" : (needsIntake ? "pending" : "received");
  const coupleId = assessment.missingForms.includes("couples") ? randomBytes(6).toString("hex") : null;
  const phone = phoneFromNote(entry.note);

  let appt: Appointment = await createAppointment({
    kind: "appointment", clientName: entry.name, clientEmail: entry.email, clinicianId: offer.clinicianId,
    typeId: offer.typeId, startAt: offer.startAt, endAt: offer.endAt, mode: offer.mode, status: "booked",
    source: "client", intakeStatus, coupleId,
    notes: ["Booked from the waitlist.", entry.note].filter(Boolean).join(" · "),
  } as never);
  appt = await attachVideoAndCalendar(appt, { clientName: entry.name, email: entry.email, phone, serviceName, durationMin });
  await setOfferAppt(offer.id, appt.id);
  await setWaitlistStatus(entry.id, "booked");
  // Everyone else who was offered this slot goes back to plain "waiting".
  await Promise.all(offer.notifiedEntryIds.filter((id) => id !== entry.id).map((id) => setWaitlistStatus(id, "waiting").catch(() => {})));

  const origin = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  if (needsIntake) {
    const forms = assessment.missingForms.map((form) => ({ form, url: `${origin}${intakeLinkPath(offer.clinicianId, form, coupleId || undefined)}` }));
    await sendIntakeInvite({ to: entry.email, clientName: entry.name, clinicianName, serviceName, whenText: caymanWhen(appt.startAt), forms });
  }
  await sendBookingConfirmation({
    id: appt.id, startAt: appt.startAt, endAt: appt.endAt,
    to: entry.email, clientName: entry.name, serviceName, clinicianName,
    whenText: caymanWhen(appt.startAt), mode: appt.mode, locationOrLink: appt.locationOrLink,
    manageUrl: `${origin}/book/manage?preview=${PREVIEW}&id=${appt.id}`,
    portalUrl: `${origin}/portal/${portalToken(entry.email)}`,
    intakeForms: needsIntake ? assessment.missingForms.map((f) => formShortLabel(f)) : [],
  });

  return NextResponse.json({
    ok: true,
    appointment: { id: appt.id, startAt: appt.startAt },
    serviceName, clinicianName, whenText: caymanWhen(appt.startAt),
    manageUrl: `/book/manage?preview=${PREVIEW}&id=${appt.id}`,
  });
}
