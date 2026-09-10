import { NextResponse } from "next/server";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { isSystemAdmin, type Clinician } from "@/lib/clinicians";
import { getAppointment } from "@/lib/scheduling";
import { listClients, listAllClients } from "@/lib/clients";
import { findIntakeForClient } from "@/lib/intakeLink";

export const dynamic = "force-dynamic";

// Phase 0 (read-only): for the appointment's client, report whether they already
// exist as a billing client and/or have intake on file. No writes; metadata only
// (never intake answers). Keyed by appointment id so no name is put in the URL.
const seesAllSchedule = (c: Clinician) => isSystemAdmin(c) || c.contact === "owner" || c.id === "donnet-oconnor";
const isTreating = (c: Clinician) => !!c.test || (!c.intakeHidden && c.contact !== "biller" && c.contact !== "admin");
const norm = (s: string) => s.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
const splitName = (full: string) => { const p = full.trim().split(/\s+/); return { first: p[0] || "", last: p.slice(1).join(" ") || "" }; };

export async function GET(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const me = user.clinician;
  const schedAll = seesAllSchedule(me);
  if (!schedAll && !isTreating(me)) return NextResponse.json({ error: "Not permitted." }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id") || "";
  const appt = id ? await getAppointment(id) : null;
  if (!appt) return NextResponse.json({ error: "Not found." }, { status: 404 });
  // A clinician may only probe their own appointments.
  if (!schedAll && appt.clinicianId !== me.id) return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  if (appt.kind === "block" || !appt.clientName.trim()) return NextResponse.json({ billingClient: null, intake: { count: 0 } });

  const { first, last } = splitName(appt.clientName);
  const target = norm(appt.clientName);

  // Billing client match — respects BILLING visibility (not scheduling's).
  const billingSeesAll = isBiller(user.role) || isOwner(user.role) || isSystemAdmin(me);
  let billingClient: { id: string; name: string } | null = null;
  try {
    const clients = billingSeesAll ? await listAllClients() : await listClients(me.id);
    const hit = clients.find((c) => norm(`${c.first} ${c.last}`) === target);
    if (hit) billingClient = { id: hit.id, name: `${hit.first} ${hit.last}`.trim() };
  } catch { /* surfacing is best-effort */ }

  // Intake match — metadata only. Owner/admin see any; everyone else only their own.
  const intakeSeesAll = isOwner(user.role) || isSystemAdmin(me);
  let intakeCount = 0;
  try {
    let hits = await findIntakeForClient(first, last);
    if (!intakeSeesAll) hits = hits.filter((h) => h.clinicianId === me.id);
    intakeCount = hits.length;
  } catch { /* surfacing is best-effort */ }

  return NextResponse.json({ billingClient, intake: { count: intakeCount } });
}
