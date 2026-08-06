import { redirect } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { devMode } from "@/lib/billingRole";
import { getSidebarData } from "@/lib/sidebarData";
import UnifiedSidebar from "@/components/UnifiedSidebar";
import AccountClient from "./AccountClient";
import IdleLogout from "@/components/IdleLogout";

export const dynamic = "force-dynamic";

function initials(name: string): string {
  const words = name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter((w) => w && !/^(dr|mrs|mr|ms|miss)\.?$/i.test(w));
  return (words.slice(0, 2).map((w) => w[0]).join("") || name[0] || "?").toUpperCase();
}

export default async function AccountPage() {
  const me = await getCurrentClinician();
  if (!me) redirect("/login?next=/account");
  const sidebar = await getSidebarData(me);

  return (
    <div className="biz">
      <UnifiedSidebar data={sidebar} isDev={devMode()} />
      <main className="bo-main">
        <div className="container container-narrow" style={{ padding: 0 }}>
          <IdleLogout />
          <div className="card">
            <div className="page-head" style={{ marginBottom: 22 }}>
              <div className="avatar">{initials(me.name)}</div>
              <div>
                <div className="greeting">Account</div>
                <h1 className="who">{me.name}</h1>
                <p className="who-sub">{me.email}</p>
              </div>
            </div>

            <AccountClient />
          </div>
        </div>
      </main>
    </div>
  );
}
