import { NextResponse, type NextRequest } from "next/server";

// =============================================================================
// Canonical domain.
//
// The production deployment is reachable at both the branded portal domain and
// the project's *.vercel.app URL. Video OAuth (Zoom/Google) is registered to the
// portal, client-facing links use it, and separate per-domain logins confuse
// staff — so page loads on the production vercel URL are bounced to the portal.
// Gated to VERCEL_ENV === "production" so PREVIEW deployments (their own unique
// *.vercel.app URLs) are left alone, and limited to page requests so Vercel cron
// jobs and OAuth callbacks that may hit the vercel host over /api keep working.
// =============================================================================
const CANONICAL_HOST = "portal.caymanessentialcare.com";

// =============================================================================
// View-as is READ-ONLY.
//
// When a system admin "views as" another person, lib/auth.ts (getCurrentClinician)
// swaps the effective identity to that person for the WHOLE request — reads and
// writes alike — so any change would be performed and, worse, audit-logged
// (logChange) as that person rather than the admin who actually did it. To keep
// the audit trail honest, we refuse mutating requests to the authenticated app
// APIs while the admin_as cookie is set. The admin returns to their own account
// ("Me" in the switcher, which clears admin_as) to make changes.
//
// Enforced centrally here because identity is swapped for every route; a per-route
// guard would have to be repeated across ~30 handlers.
// =============================================================================

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Authenticated, audit-relevant API namespaces. Public flows (intake submit,
// client booking, portal, waitlist) and auth/logout are intentionally NOT here.
const BLOCKED_PREFIXES = [
  "/api/billing", "/api/comms", "/api/account", "/api/builder-tasks",
  "/api/feedback", "/api/report", "/api/scheduling", "/api/submissions", "/api/admin",
];

// Read the signed-in clinician id from the session cookie WITHOUT verifying its
// signature — used only to recognise "viewing as myself" (an admin who is also the
// owner/biller), which is not real impersonation. Never used for authentication:
// the route handlers still verify the session properly (lib/auth.ts).
function sessionCid(token: string | undefined): string {
  if (!token) return "";
  try {
    const p = token.split(".")[0] ?? "";
    const std = p.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(p.length / 4) * 4, "=");
    const json = JSON.parse(atob(std)) as { cid?: unknown };
    return typeof json.cid === "string" ? json.cid : "";
  } catch { return ""; }
}

export function middleware(req: NextRequest): NextResponse {
  // Canonical domain: send production *.vercel.app page loads to the portal.
  const host = req.headers.get("host") || "";
  if (
    process.env.VERCEL_ENV === "production" &&
    host.endsWith(".vercel.app") &&
    host !== CANONICAL_HOST &&
    !req.nextUrl.pathname.startsWith("/api")
  ) {
    const url = req.nextUrl.clone();
    url.protocol = "https:";
    url.host = CANONICAL_HOST;
    return NextResponse.redirect(url, 307);
  }

  if (!WRITE_METHODS.has(req.method)) return NextResponse.next();
  const as = req.cookies.get("admin_as")?.value;
  if (!as) return NextResponse.next();                                  // not viewing as anyone
  if (as === sessionCid(req.cookies.get("tifec_session")?.value)) return NextResponse.next(); // viewing as self
  const path = req.nextUrl.pathname;
  if (!BLOCKED_PREFIXES.some((pre) => path === pre || path.startsWith(pre + "/"))) return NextResponse.next();
  return NextResponse.json(
    { error: "You're viewing as someone else, so this is read-only. Switch back to your own account (Me in the menu) to make changes." },
    { status: 403 },
  );
}

export const config = {
  // Runs on all routes (so the canonical-domain redirect catches page loads)
  // except Next's own static assets. The view-as block self-limits to its API
  // prefixes internally, so the wider match doesn't change its behaviour.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
