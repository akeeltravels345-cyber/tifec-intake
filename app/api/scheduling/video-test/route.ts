import { NextResponse } from "next/server";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import { testVideoProvider } from "@/lib/videoLinks";
import type { VideoProvider } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

// Admin-only: checks the env credentials for the chosen video provider actually
// authenticate (and, for Google, that the service account can act as the host).
export async function POST(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isSystemAdmin(user.clinician)) return NextResponse.json({ error: "Not permitted." }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const provider = String(body.provider || "none") as VideoProvider;
  const host = String(body.host || "").trim();
  const result = await testVideoProvider(provider, host);
  return NextResponse.json(result);
}
