import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getBillingUser } from "@/lib/billingRole";
import { listConnections, zoomOAuthConfigured, googleOAuthConfigured } from "@/lib/videoConnections";
import VideoConnections from "@/components/scheduling/VideoConnections";
import CalendarSubscribe from "@/components/scheduling/CalendarSubscribe";
import BusyFeeds from "@/components/scheduling/BusyFeeds";
import { calendarFeedPath } from "@/lib/calendarFeed";
import { getAvailability } from "@/lib/scheduling";
import { hasGoogleConnection } from "@/lib/videoConnections";
import { seesAllSchedule, isTreatingClinician } from "../layout";

export const dynamic = "force-dynamic";

// A clinician connects their OWN Zoom / Google Meet here. Virtual bookings then
// get a meeting link created on their account automatically.
export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/schedule/connections");
  const me = user.clinician;
  if (!seesAllSchedule(me) && !isTreatingClinician(me)) redirect("/today");

  const [conns, sp, h, av, googleConnected] = await Promise.all([listConnections(me.id), searchParams, headers(), getAvailability(me.id), hasGoogleConnection(me.id)]);
  const initial = conns.map((c) => ({ provider: c.provider, accountEmail: c.accountEmail, preferred: c.preferred }));
  const origin = process.env.APP_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;
  const feedUrl = `${origin}${calendarFeedPath(me.id)}`;

  return (
    <div className="sh-wrap">
      <div className="sh-bar"><a className="sh-back" href="/schedule">← Back to my agenda</a></div>
      <VideoConnections
        initial={initial}
        configured={{ zoom: zoomOAuthConfigured(), google: googleOAuthConfigured() }}
        notice={{ connected: sp.connected || "", error: sp.error || "" }}
      />
      <CalendarSubscribe url={feedUrl} />
      <BusyFeeds initialFeeds={av.busyFeeds} googleConnected={googleConnected} />
    </div>
  );
}
