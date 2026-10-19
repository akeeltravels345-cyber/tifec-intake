import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getBillingUser, devMode } from "@/lib/billingRole";
import { inScheduleBeta } from "@/lib/clinicians";
import IdleLogoutForUser from "@/components/IdleLogoutForUser";
import MobileNav from "@/components/scheduling/MobileNav";
import { unreadCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// A separate manifest so this installs as its OWN home-screen app ("Schedule"),
// opening straight to /m — distinct from the general TIFEC app.
export const metadata: Metadata = {
  title: "TIFEC Schedule",
  manifest: "/schedule.webmanifest",
  appleWebApp: { capable: true, title: "Schedule", statusBarStyle: "default" },
};

// viewport-fit=cover is required for env(safe-area-inset-*) to report real
// values on notched phones — without it the fixed bottom nav floats above the
// home-indicator strip instead of sitting flush at the screen bottom.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// The mobile scheduling app shell. Deliberately does NOT render UnifiedSidebar —
// its navigation is MobileNav (a bottom tab bar), fully independent of the web
// app's menu. The `mapp` marker also hides the site brand bar + footer (see
// globals.css) so it reads as a standalone app on a phone.
export default async function MobileAppLayout({ children }: { children: React.ReactNode }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/m");
  if (!inScheduleBeta(user.clinician)) redirect("/today");

  // Theme: an explicit light/dark choice is stored in the `m-theme` cookie (set
  // from the Me screen) and applied server-side so there's no flash. With no
  // cookie, the app follows the phone's setting via prefers-color-scheme (CSS).
  const themeCookie = (await cookies()).get("m-theme")?.value;
  const dataTheme = themeCookie === "dark" || themeCookie === "light" ? themeCookie : undefined;
  const unread = await unreadCount(user.clinician.id);

  // Full-bleed shell: each screen renders its own header; MobileNav is the only
  // chrome (and hides itself on full-screen flows like Book/Edit/Detail/Hours).
  return (
    <div className="biz mapp" data-theme={dataTheme}>
      {!devMode() && <IdleLogoutForUser />}
      <main className="mapp-main">{children}</main>
      <MobileNav unread={unread} />
    </div>
  );
}
