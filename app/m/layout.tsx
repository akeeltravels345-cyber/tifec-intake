import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getBillingUser, devMode } from "@/lib/billingRole";
import { inScheduleBeta } from "@/lib/clinicians";
import IdleLogoutForUser from "@/components/IdleLogoutForUser";
import MobileNav from "@/components/scheduling/MobileNav";

export const dynamic = "force-dynamic";

// A separate manifest so this installs as its OWN home-screen app ("Schedule"),
// opening straight to /m — distinct from the general TIFEC app.
export const metadata: Metadata = {
  title: "TIFEC Schedule",
  manifest: "/schedule.webmanifest",
  appleWebApp: { capable: true, title: "Schedule", statusBarStyle: "default" },
};

// The mobile scheduling app shell. Deliberately does NOT render UnifiedSidebar —
// its navigation is MobileNav (a bottom tab bar), fully independent of the web
// app's menu. The `mapp` marker also hides the site brand bar + footer (see
// globals.css) so it reads as a standalone app on a phone.
export default async function MobileAppLayout({ children }: { children: React.ReactNode }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/m");
  if (!inScheduleBeta(user.clinician)) redirect("/today");

  // Full-bleed shell: each screen renders its own dark header (date strip,
  // month nav, profile, …), so there's no generic top bar here.
  return (
    <div className="biz mapp">
      {!devMode() && <IdleLogoutForUser />}
      <main className="mapp-main">{children}</main>
      <MobileNav />
    </div>
  );
}
