import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin, type Clinician } from "@/lib/clinicians";
import { exchangeCode, saveConnection, type VideoProviderId } from "@/lib/videoConnections";

export const dynamic = "force-dynamic";

const canConnect = (c: Clinician) =>
  isSystemAdmin(c) || c.contact === "owner" || !!c.test || (!c.intakeHidden && c.contact !== "biller");
const back = (req: Request, params: string) => NextResponse.redirect(new URL(`/schedule/connections?${params}`, req.url));

// OAuth redirect target. Exchanges the code and stores the connection against
// the SIGNED-IN clinician (never a value from the request), then returns them.
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const user = await getBillingUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/schedule/connections", req.url));
  if (!canConnect(user.clinician)) return NextResponse.redirect(new URL("/today", req.url));
  const me = user.clinician;

  const { provider } = await ctx.params;
  if (provider !== "zoom" && provider !== "google") return back(req, "error=Unknown+provider");
  const prov = provider as VideoProviderId;

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  if (url.searchParams.get("error")) return back(req, `error=${encodeURIComponent(url.searchParams.get("error") || "Authorization+declined")}`);
  if (!code) return back(req, "error=Missing+authorization+code");

  // CSRF: the cookie set at connect time must match this provider + nonce.
  const cookie = (await cookies()).get("vid_oauth")?.value || "";
  if (cookie !== `${prov}:${state}`) return back(req, "error=Session+expired,+please+try+again");

  const base = (process.env.APP_URL || url.origin).replace(/\/$/, "");
  const redirectUri = `${base}/api/scheduling/video/callback/${prov}`;
  try {
    const t = await exchangeCode(prov, code, redirectUri);
    if (prov === "google" && !t.refreshToken) {
      // No refresh token means Google won't let us mint links later; ask again.
      return back(req, "error=Please+allow+offline+access+(try+reconnecting)");
    }
    await saveConnection({ clinicianId: me.id, provider: prov, accessToken: t.accessToken, refreshToken: t.refreshToken, expiresAt: t.expiresAt, accountEmail: t.accountEmail });
  } catch (e) {
    console.error("video oauth exchange failed", e);
    return back(req, "error=Could+not+connect.+Please+try+again");
  }
  const res = back(req, `connected=${prov}`);
  res.cookies.set("vid_oauth", "", { path: "/", maxAge: 0 });
  return res;
}
