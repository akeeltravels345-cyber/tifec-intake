import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { unreadCount } from "@/lib/comms";
import { isContact } from "@/lib/clinicians";
import TeamTabs from "@/components/team/TeamTabs";

export const dynamic = "force-dynamic";

// The team area is for everyone who works here, so it lives in the intake app
// rather than behind the billing beta gate.
export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentClinician();
  if (!me) redirect("/login?next=/team/messages");
  const unread = await unreadCount(me.id);

  return (
    <div className="tm">
      <div className="tm-strip" />
      <div className="tm-wrap">
        <div className="tm-top">
          <Link href="/dashboard" className="tm-back">← Dashboard</Link>
          <div className="tm-me">{me.name}</div>
        </div>
        <TeamTabs unread={unread} isContact={isContact(me.id)} />
        <main className="tm-main">{children}</main>
      </div>
    </div>
  );
}
