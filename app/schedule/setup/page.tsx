import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { inScheduleBeta } from "@/lib/clinicians";
import { getBillingUser } from "@/lib/billingRole";
import { listConnections, zoomOAuthConfigured, googleOAuthConfigured, hasGoogleConnection } from "@/lib/videoConnections";
import { getAvailability } from "@/lib/scheduling";
import { calendarFeedPath } from "@/lib/calendarFeed";
import SetupWizard from "@/components/scheduling/SetupWizard";

export const dynamic = "force-dynamic";

// A gentle, guided first-run setup for clinicians: connect video + sync the
// calendar, one step at a time. Reuses the same data the connections page uses.
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/schedule/setup");
  const me = user.clinician;
  if (!inScheduleBeta(me)) redirect("/today");

  const [conns, sp, h, av, googleConnected] = await Promise.all([
    listConnections(me.id),
    searchParams,
    headers(),
    getAvailability(me.id),
    hasGoogleConnection(me.id),
  ]);
  const origin = process.env.APP_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;
  const feedUrl = `${origin}${calendarFeedPath(me.id)}`;

  return (
    <div className="sh-wrap">
      <div className="sh-bar"><a className="sh-back" href="/schedule">← Back to my agenda</a></div>
      <SetupWizard
        conns={conns.map((c) => ({ provider: c.provider, accountEmail: c.accountEmail, preferred: c.preferred }))}
        configured={{ zoom: zoomOAuthConfigured(), google: googleOAuthConfigured() }}
        zoomComingSoon={!me.test}
        feedUrl={feedUrl}
        busyFeeds={av.busyFeeds}
        googleConnected={googleConnected}
        notice={{ connected: sp.connected || "", error: sp.error || "" }}
      />
    </div>
  );
}
