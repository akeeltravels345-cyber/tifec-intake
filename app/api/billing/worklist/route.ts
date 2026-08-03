import { NextResponse } from "next/server";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { addFeature } from "@/lib/worklist";

export const runtime = "nodejs";

// Add a feature request to the shared worklist. Open to the owner, the biller,
// and the system admin (Akeel) — the people who collaborate on the build.
export async function POST(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const allowed = isOwner(user.role) || isBiller(user.role) || user.clinician.contact === "admin";
  if (!allowed) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  let body: { name?: string; description?: string; flowStart?: string; flowEnd?: string; priority?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Give the feature a name." }, { status: 400 });

  const start = (body.flowStart || "").trim();
  const end = (body.flowEnd || "").trim();
  const flow = start || end ? `${start || "?"} → ${end || "?"}` : "";

  try {
    await addFeature(user.clinician.id, {
      name: name.slice(0, 120),
      description: (body.description || "").slice(0, 2000),
      flow: flow.slice(0, 400),
      priority: String(body.priority || "nice"),
    });
  } catch (err) {
    console.error("worklist add failed:", err);
    return NextResponse.json({ error: "Could not save. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
