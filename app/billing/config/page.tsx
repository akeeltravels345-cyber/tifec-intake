import { redirect } from "next/navigation";
import { getBillingUser, canConfigure, canConfigureBilling, isOwner } from "@/lib/billingRole";
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

  return (
    <SetupClient
      insurers={insurers}
      cptCodes={cptCodes.map((c) => ({ code: c.code, description: c.description, fee: c.fee ?? 0, hrs: c.hrs ?? 1, active: c.active }))}
      clinicians={CLINICIANS.map((c) => ({ id: c.id, name: c.name }))}
      settings={settings.map((s) => ({ clinicianId: s.clinicianId, retentionPct: s.retentionPct, otherDeductionPct: s.otherDeductionPct, otherDeductionFixed: s.otherDeductionFixed, billerPct: s.billerPct ?? 0 }))}
      canManageMoney={isOwner(user.role)}
      billerPct={cfg.billerCommissionPct}
      expenses={cfg.runningExpenses}
      provider={cfg.provider ?? {}}
      renderingClinicians={CLINICIANS.filter((c) => !c.intakeHidden && c.billing !== "biller").map((c) => ({ id: c.id, name: c.name }))}
      billerName={biller.name}
      billerInitials={initials(biller.name)}
    />
  );
}
