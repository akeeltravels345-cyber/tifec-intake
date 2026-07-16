import { redirect } from "next/navigation";
import { getBillingUser, devMode, hasBillingBeta } from "@/lib/billingRole";
import { listSessions, getPracticeConfig } from "@/lib/billing";
import BillingSidebar from "@/components/billing/BillingSidebar";
import IdleLogout from "@/components/IdleLogout";

export const dynamic = "force-dynamic";

function initialsOf(name: string): string {
  const parts = name.replace(/^(Dr\.?|Mrs\.?|Mr\.?|Ms\.?|Miss)\s+/i, "").trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing");
  // BETA: billing is only available to enrolled accounts. Everyone else goes back to intake.
  if (!hasBillingBeta(user.clinician)) redirect("/dashboard?billing=beta");

  const [sessions, cfg] = await Promise.all([listSessions(), getPracticeConfig()]);
  const queueCount = sessions.filter((s) => s.insurerId && !s.insurancePaid).length;

  const roleLabel =
    user.role === "owner" ? "Owner"
    : user.role === "biller" ? `Biller · ${cfg.billerCommissionPct}% of collected`
    : user.clinician.credentials;

  return (
    <div className="biz">
      {!devMode() && <IdleLogout />}
      <BillingSidebar
        role={user.role}
        meId={user.clinician.id}
        name={user.clinician.name}
        initials={initialsOf(user.clinician.name)}
        roleLabel={roleLabel}
        queueCount={queueCount}
        isDev={devMode()}
      />
      <main className="bo-main">{children}</main>
    </div>
  );
}
