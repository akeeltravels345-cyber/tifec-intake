import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { billingRoleOf, canMarkBilled } from "@/lib/billingRole";
import { getSession, deleteSession } from "@/lib/billing";

// Delete a single charge (one logged session / date of service). Because the
// queue, dashboards, payouts and commission are all computed live from the
// sessions, removing one here removes it from every view automatically; the CPT
// links are cleaned up inside deleteSession.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const session = await getSession(id);
  if (!session) return NextResponse.json({ error: "Charge not found." }, { status: 404 });

  // Biller/owner can delete any charge; a clinician only their own.
  const allowed = canMarkBilled(billingRoleOf(me)) || session.clinicianId === me.id || session.createdBy === me.id;
  if (!allowed) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const ok = await deleteSession(id);
  if (!ok) return NextResponse.json({ error: "Charge not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
