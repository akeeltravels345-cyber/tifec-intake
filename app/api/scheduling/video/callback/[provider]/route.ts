import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin, type Clinician } from "@/lib/clinicians";
import { exchangeCode, saveConnection, type VideoProviderId } from "@/lib/videoConnections";

export const dynamic = "force-dynamic";

const canConnect = (c: Clinician) =>
  isSystemAdmin(c) || c.contact === "owner" || !!c.test || (!c.intakeHidden && c.contact !== "biller");
// Return them to wherever they started the connect from (the wizard or the
// connections page). Path is validated at connect time; re-check here.
const safeReturn = (p: string | undefined) => (p && /^\/schedule\/[A-Za-z0-9/_-]*$/.test(p) ? p : "/schedule/connections");
const back = (req: Request, dest: string, params: string) => NextResponse.redirect(new URL(`${dest}?${params}`, req.url));

// OAuth redirect target. Exchanges the code and stores the connection against
// the SIGNED-IN clinician (never a value from the request), then returns them.
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const user = await getBillingUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/schedule/connections", req.url));
  if (!canConnect(user.clinician)) return NextResponse.redirect(new URL("/today", req.url));
  const me = user.clinician;

  // Land them back where they started (wizard or connections page).
  const dest = safeReturn((await cookies()).get("vid_return")?.value);
  const clearReturn = (res: NextResponse) => { res.cookies.set("vid_return", "", { path: "/", maxAge: 0 }); return res; };

  const { provider } = await ctx.params;
  if (provider !== "zoom" && provider !== "google") return clearReturn(back(req, dest, "error=Unknown+provider"));
  const prov = provider as VideoProviderId;

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  if (url.searchParams.get("error")) return clearReturn(back(req, dest, `error=${encodeURIComponent(url.searchParams.get("error") || "Authorization+declined")}`));
  if (!code) return clearReturn(back(req, dest, "error=Missing+authorization+code"));

  // CSRF: the cookie set at connect time must match this provider + nonce.
  const cookie = (await cookies()).get("vid_oauth")?.value || "";
  if (cookie !== `${prov}:${state}`) return clearReturn(back(req, dest, "error=Session+expired,+please+try+again"));

  const base = (process.env.APP_URL || url.origin).replace(/\/$/, "");
  const redirectUri = `${base}/api/scheduling/video/callback/${prov}`;
  try {
    const t = await exchangeCode(prov, code, redirectUri);
    if (prov === "google") {
      if (!t.refreshToken) {
        // No refresh token means Google won't let us mint links later; ask again.
        return clearReturn(back(req, dest, "error=Please+allow+offline+access+(try+reconnecting)"));
      }
      if (!t.scope.includes("calendar.events")) {
        // Calendar box wasn't ticked, so we can't create Meet links. Don't save a
        // useless connection; tell them to allow Calendar access and retry.
        return clearReturn(back(req, dest, "error=Please+tick+the+Google+Calendar+permission+when+connecting,+then+try+again"));
      }
    }
    await saveConnection({ clinicianId: me.id, provider: prov, accessToken: t.accessToken, refreshToken: t.refreshToken, expiresAt: t.expiresAt, accountEmail: t.accountEmail });
  } catch (e) {
    console.error("video oauth exchange failed", e);
    return clearReturn(back(req, dest, "error=Could+not+connect.+Please+try+again"));
  }
  const res = clearReturn(back(req, dest, `connected=${prov}`));
  res.cookies.set("vid_oauth", "", { path: "/", maxAge: 0 });
  return res;
}
