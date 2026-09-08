import { NextResponse } from "next/server";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin, type Clinician } from "@/lib/clinicians";
import { listConnections, setPreferred, deleteConnection, type VideoProviderId } from "@/lib/videoConnections";

export const dynamic = "force-dynamic";

const canConnect = (c: Clinician) =>
  isSystemAdmin(c) || c.contact === "owner" || (!c.intakeHidden && c.contact !== "biller");
const asProvider = (v: unknown): VideoProviderId | null => (v === "zoom" || v === "google" ? v : null);

// Manage the signed-in clinician's OWN video connections (choose default, remove).
export async function POST(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!canConnect(user.clinician)) return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  const me = user.clinician;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const action = String(body.action || "");
  const provider = asProvider(body.provider);
  if (!provider) return NextResponse.json({ error: "Unknown provider." }, { status: 400 });

  try {
    if (action === "prefer") await setPreferred(me.id, provider);
    else if (action === "disconnect") await deleteConnection(me.id, provider);
    else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    const connections = (await listConnections(me.id)).map((c) => ({ provider: c.provider, accountEmail: c.accountEmail, preferred: c.preferred }));
    return NextResponse.json({ ok: true, connections });
  } catch (e) {
    console.error("video connection action failed", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
