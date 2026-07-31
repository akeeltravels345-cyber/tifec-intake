import { redirect } from "next/navigation";
import { getBillingUser, canConfigure, canConfigureBilling, isOwner, isBiller } from "@/lib/billingRole";
import { listInsurers, listCptCodes, listClinicianSettings, getPracticeConfig } from "@/lib/billing";
import { CLINICIANS } from "@/lib/clinicians";
import SetupClient from "@/components/billing/SetupClient";

export const dynamic = "force-dynamic";
const initials = (name: string) => { const p = name.replace(/^(Dr\.?|Mrs\.?|Mr\.?|Ms\.?|Miss)\s+/i, "").trim().split(/\s+/); return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); };

export default async function SetupPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/config");
  if (!canConfigureBilling(user.role)) redirect("/billing/me");

  const [insurers, cptCodes, settings, cfg] = await Promise.all([listInsurers(), listCptCodes(), listClinicianSettings(), getPracticeConfig()]);
  const biller = CLINICIANS.find((c) => c.billing === "biller") ?? CLINICIANS[0];
  const now = new Date();
  const currentMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  return (
    <SetupClient
      insurers={insurers}
      cptCodes={cptCodes.map((c) => ({ code: c.code, description: c.description, fee: c.fee ?? 0, hrs: c.hrs ?? 1, active: c.active }))}
      clinicians={CLINICIANS.map((c) => ({ id: c.id, name: c.name }))}
      settings={settings.map((s) => ({ clinicianId: s.clinicianId, retentionPct: s.retentionPct, otherDeductionPct: s.otherDeductionPct, otherDeductionFixed: s.otherDeductionFixed, pension: s.pension ?? 0, billerPct: s.billerPct ?? 0, billerBasePct: s.billerBasePct ?? 0, billerCommissionApplies: s.billerCommissionApplies ?? false, noPayout: s.noPayout ?? false }))}
      canManageMoney={isOwner(user.role)}
      isBillerUser={isBiller(user.role)}
      canSeeProvider={isBiller(user.role) || user.clinician.contact === "admin"}
      billerPct={cfg.billerCommissionPct}
      processingFeePct={cfg.processingFeePct ?? 0}
      isAdmin={user.clinician.contact === "admin"}
      expenses={cfg.runningExpenses}
      monthlyExpenses={cfg.monthlyExpenses ?? {}}
      currentMonthKey={currentMonthKey}
      provider={cfg.provider ?? {}}
      renderingClinicians={CLINICIANS.filter((c) => !c.intakeHidden && c.billing !== "biller").map((c) => ({ id: c.id, name: c.name }))}
      billerName={biller.name}
      billerInitials={initials(biller.name)}
    />
  );
}
