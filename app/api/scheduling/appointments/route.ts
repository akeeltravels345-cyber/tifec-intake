import { NextResponse } from "next/server";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin, type Clinician } from "@/lib/clinicians";
import {
  listAppointments, createAppointment, updateAppointment, deleteAppointment,
  createRecurring, deleteSeriesFrom, getAppointment,
  type Appointment,
} from "@/lib/scheduling";
import { maybeBridgeSeen } from "@/lib/schedulingBridge";
import { createVideoLink, cancelVideoLink } from "@/lib/videoConnections";

export const dynamic = "force-dynamic";

// For a virtual individual appointment with no link yet, auto-create a meeting
// on the clinician's OWN connected Zoom/Meet account. Best-effort: never blocks.
async function attachVideo(appt: Appointment): Promise<Appointment> {
  if (appt.kind === "block" || appt.mode !== "virtual" || appt.locationOrLink || appt.capacity > 1) return appt;
  const link = await createVideoLink(appt.clinicianId, {
    topic: `TIFEC session${appt.clientName ? ` - ${appt.clientName}` : ""}`,
    startAtISO: appt.startAt, durationMin: Math.round((Date.parse(appt.endAt) - Date.parse(appt.startAt)) / 60000),
  });
  if (!link) return appt;
  return (await updateAppointment(appt.id, { locationOrLink: link.url })) || appt;
}

// Reads and writes are scoped: a treating clinician sees and edits only their
// own agenda; the owner, Donnet O'Connor and the admin see and edit everyone.
const seesAll = (c: Clinician) => isSystemAdmin(c) || c.contact === "owner" || c.id === "donnet-oconnor";
const isTreating = (c: Clinician) => !!c.test || (!c.intakeHidden && c.contact !== "biller" && c.contact !== "admin");

export async function GET(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const me = user.clinician;
  const all = seesAll(me);
  if (!all && !isTreating(me)) return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  const p = new URL(req.url).searchParams;
  // Clinicians are locked to their own id no matter what they ask for.
  const clinicianId = all ? (p.get("clinicianId") || undefined) : me.id;
  const appointments = await listAppointments({
    from: p.get("from") || undefined,
    to: p.get("to") || undefined,
    clinicianId,
  });
  return NextResponse.json({ appointments, viewer: { seesAll: all, meId: me.id } });
}

export async function POST(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const me = user.clinician;
  const all = seesAll(me);
  if (!all && !isTreating(me)) return NextResponse.json({ error: "Not permitted." }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const action = String(body.action || "");

  // A treating clinician may only touch their own appointments.
  async function ownsTarget(id: string): Promise<boolean> {
    if (all) return true;
    const existing = await getAppointment(id);
    return !!existing && existing.clinicianId === me.id;
  }

  try {
    if (action === "create") {
      // Clinicians are forced onto their own id; owner/Donnet/admin may pick anyone.
      const clinicianId = all ? String(body.clinicianId || "") : me.id;
      if (!clinicianId) return NextResponse.json({ error: "Pick a clinician." }, { status: 400 });
      if (!body.startAt || !body.endAt) return NextResponse.json({ error: "When is it?" }, { status: 400 });
      if (body.kind !== "block" && !String(body.clientName || "").trim()) {
        return NextResponse.json({ error: "Who is it for?" }, { status: 400 });
      }
      const base = { ...body, clinicianId, createdBy: me.id, source: "staff" } as Record<string, unknown>;
      delete base.repeatEveryDays; delete base.repeatCount;
      const everyDays = Number(body.repeatEveryDays) || 0;
      const count = Number(body.repeatCount) || 1;
      if (everyDays > 0 && count > 1) {
        const made = await createRecurring(base as never, everyDays, count);
        const withVideo = await Promise.all(made.map((a) => attachVideo(a)));
        return NextResponse.json({ ok: true, appointment: withVideo[0], count: withVideo.length });
      }
      const appt = await attachVideo(await createAppointment(base as never));
      return NextResponse.json({ ok: true, appointment: appt });
    }

    if (action === "series:removeFrom") {
      // Bulk series delete stays with the schedule owners only.
      if (!all) return NextResponse.json({ error: "Not permitted." }, { status: 403 });
      const removed = await deleteSeriesFrom(String(body.seriesId), String(body.fromStartAt));
      return NextResponse.json({ ok: true, removed });
    }
    if (action === "update" || action === "status") {
      const id = String(body.id);
      if (!(await ownsTarget(id))) return NextResponse.json({ error: "Not permitted." }, { status: 403 });
      // A clinician can't reassign their appointment to someone else.
      const patch = all ? body : { ...body, clinicianId: me.id };
      const appt = await updateAppointment(id, patch as never);
      if (!appt) return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
      // Cancelling frees the Zoom meeting from the clinician's account.
      if (body.status === "cancelled" && appt.mode === "virtual" && appt.locationOrLink) await cancelVideoLink(appt.clinicianId, appt.locationOrLink);
      // Seen -> billing session, only if the admin turned the bridge on.
      let billingSessionId: string | null = appt.billingSessionId;
      if (appt.status === "seen" && !appt.billingSessionId) {
        try { billingSessionId = (await maybeBridgeSeen(appt.id)) ?? appt.billingSessionId; } catch (e) { console.error("bridge failed", e); }
      }
      return NextResponse.json({ ok: true, appointment: { ...appt, billingSessionId } });
    }
    if (action === "delete") {
      const id = String(body.id);
      if (!(await ownsTarget(id))) return NextResponse.json({ error: "Not permitted." }, { status: 403 });
      // Cancel the Zoom meeting too, so it isn't orphaned on the clinician's account.
      const existing = await getAppointment(id);
      if (existing?.mode === "virtual" && existing.locationOrLink) await cancelVideoLink(existing.clinicianId, existing.locationOrLink);
      await deleteAppointment(id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    console.error("appointments action failed", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
