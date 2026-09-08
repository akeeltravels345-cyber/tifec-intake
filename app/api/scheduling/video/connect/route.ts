import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin, type Clinician } from "@/lib/clinicians";
import { authorizeUrl, oauthConfigured, type VideoProviderId } from "@/lib/videoConnections";

export const dynamic = "force-dynamic";

const canConnect = (c: Clinician) =>
  isSystemAdmin(c) || c.contact === "owner" || (!c.intakeHidden && c.contact !== "biller");

// Kicks off the OAuth flow for the signed-in clinician's OWN account.
export async function GET(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/schedule/connections", req.url));
  if (!canConnect(user.clinician)) return NextResponse.redirect(new URL("/today", req.url));

  const provider = new URL(req.url).searchParams.get("provider") as VideoProviderId | null;
  if (provider !== "zoom" && provider !== "google") {
    return NextResponse.redirect(new URL("/schedule/connections?error=Unknown+provider", req.url));
  }
  if (!oauthConfigured(provider)) {
    return NextResponse.redirect(new URL(`/schedule/connections?error=${provider}+is+not+set+up+on+the+server+yet`, req.url));
  }

  const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const redirectUri = `${base}/api/scheduling/video/callback/${provider}`;
  const nonce = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(provider, redirectUri, nonce));
  // CSRF guard: the callback must present this same nonce.
  res.cookies.set("vid_oauth", `${provider}:${nonce}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  return res;
}
