import { NextResponse } from "next/server";
import { buildPracticumRoster, verifySyncToken } from "@/lib/practicumSync";

export const dynamic = "force-dynamic";

// De-identified roster feed for a practicum clinician's own dashboard.
//
//   GET /api/practicum/roster
//   Authorization: Bearer <token from /api/practicum/token>
//
// Bearer auth rather than the session cookie, because the practicum dashboard is
// a separate origin (and has no origin at all when opened as a standalone file).
// The payload carries no PHI — see lib/practicumSync.ts for the boundary rules.

// The dashboard can be served from anywhere on the clinician's machine, and the
// standalone build sends `Origin: null`. The token is the access control here,
// not the origin, so echo back whatever asked and keep credentials off.
function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin",
  };
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin")) });
}

export async function GET(req: Request) {
  const headers = cors(req.headers.get("origin"));

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token." }, { status: 401, headers });
  }

  const clinicianId = verifySyncToken(token);
  if (!clinicianId) {
    return NextResponse.json({ error: "Invalid or revoked token." }, { status: 401, headers });
  }

  try {
    const feed = await buildPracticumRoster(clinicianId);
    return NextResponse.json(feed, { headers });
  } catch (e) {
    // buildPracticumRoster throws for unknown / non-practicum clinicians. A valid
    // token for someone who is no longer a practicum clinician must stop working.
    const message = e instanceof Error ? e.message : "Could not build roster.";
    return NextResponse.json({ error: message }, { status: 403, headers });
  }
}
