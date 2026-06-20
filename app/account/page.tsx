import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
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

  return (
    <div className="container container-narrow">
      <IdleLogout />
      <Link href="/dashboard" className="back-link">← Dashboard</Link>

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
  );
}
