import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { billingRoleOf, canConfigure, canConfigureBilling } from "@/lib/billingRole";
import {
  upsertInsurer, deleteInsurer,
  upsertCptCode, deleteCptCode,
  upsertClinicianSettings, getClinicianSettings,
  savePracticeConfig, getPracticeConfig,
  type CopayType, type RunningExpense, type ProviderConfig, type PracticeConfig,
} from "@/lib/billing";

const n = (v: unknown) => (v == null || v === "" ? 0 : Number(v));
const t = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export async function POST(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const role = billingRoleOf(me);
  // Biller may manage its own billing config (insurers, codes, provider details);
  // the owner's money rules (practice = commission/expenses, settings = splits)
  // stay owner-only, enforced per entity below.
  if (!canConfigureBilling(role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const ownerOnly = (entity: string) => (entity === "practice" || entity === "settings") && !canConfigure(role);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const entity = String(body.entity ?? "");
  const action = String(body.action ?? "save");
  if (ownerOnly(entity)) return NextResponse.json({ error: "Only the owner can change the practice's money rules." }, { status: 403 });

  try {
    if (entity === "insurer") {
      if (action === "delete") {
        await deleteInsurer(String(body.id));
        return NextResponse.json({ ok: true });
      }
      const name = String(body.name ?? "").trim();
      if (!name) return NextResponse.json({ error: "Insurer name is required." }, { status: 400 });
      const copayType = (["none", "fixed", "percentage"].includes(String(body.copayType)) ? body.copayType : "none") as CopayType;
      const saved = await upsertInsurer({
        id: body.id ? String(body.id) : undefined,
        name,
        copayType,
        copayRate: n(body.copayRate),
        active: body.active !== false,
        claimCode: t(body.claimCode),
      });
      return NextResponse.json({ ok: true, id: saved.id });
    }

    if (entity === "cpt") {
      if (action === "delete") {
        await deleteCptCode(String(body.code));
        return NextResponse.json({ ok: true });
      }
      const code = String(body.code ?? "").trim();
      if (!code) return NextResponse.json({ error: "A CPT code is required." }, { status: 400 });
      // Multiple time/value options per code. Sanitised; the first is the default.
      const variants = Array.isArray(body.variants)
        ? (body.variants as { label?: unknown; minutes?: unknown; fee?: unknown }[])
            .map((v) => ({ label: String(v.label ?? "").trim(), minutes: Number(v.minutes) || 0, fee: Number(v.fee) || 0 }))
            .filter((v) => v.minutes > 0 || v.fee > 0)
        : undefined;
      await upsertCptCode({ code, description: String(body.description ?? "").trim(), active: body.active !== false, fee: n(body.fee), hrs: n(body.hrs), variants: variants && variants.length ? variants : undefined });
      return NextResponse.json({ ok: true });
    }

    if (entity === "practice") {
      // Fields are independent: a commission-only save never touches expenses, and
      // an expenses save targets one month's snapshot (expenseMonth) or the base list.
      const current = await getPracticeConfig();
      const next: PracticeConfig = { ...current };
      if (body.billerCommissionPct !== undefined) next.billerCommissionPct = n(body.billerCommissionPct);
      if (body.processingFeePct !== undefined) next.processingFeePct = n(body.processingFeePct);
      if (Array.isArray(body.runningExpenses)) {
        const expenses = (body.runningExpenses as Record<string, unknown>[]).map((e, i) => ({
          id: String(e.id || `exp-${i}`),
          name: String(e.name ?? "").trim() || "Expense",
          detail: String(e.detail ?? "").trim(),
          amount: n(e.amount),
          breakdown: Array.isArray(e.breakdown) ? (e.breakdown as Record<string, unknown>[]).map((b) => ({ label: String(b.label ?? ""), amount: n(b.amount) })) : undefined,
        })) as RunningExpense[];
        const monthKey = typeof body.expenseMonth === "string" && /^\d{4}-\d{2}$/.test(body.expenseMonth) ? body.expenseMonth : null;
        if (monthKey) next.monthlyExpenses = { ...(current.monthlyExpenses ?? {}), [monthKey]: expenses };
        else next.runningExpenses = expenses;
      }
      await savePracticeConfig(next);
      return NextResponse.json({ ok: true });
    }

    if (entity === "provider") {
      const p = (body.provider ?? {}) as Record<string, unknown>;
      const renderingIn = (p.renderingNpi ?? {}) as Record<string, unknown>;
      const renderingNpi: Record<string, string> = {};
      for (const [cid, v] of Object.entries(renderingIn)) { const npi = t(v); if (npi) renderingNpi[cid] = npi; }
      const provider: ProviderConfig = {
        practiceName: t(p.practiceName), npi: t(p.npi), ein: t(p.ein), taxonomy: t(p.taxonomy),
        addressLine1: t(p.addressLine1), addressLine2: t(p.addressLine2), city: t(p.city),
        region: t(p.region), postal: t(p.postal), country: t(p.country), phone: t(p.phone),
        email: t(p.email), website: t(p.website),
        renderingNpi: Object.keys(renderingNpi).length ? renderingNpi : undefined,
      };
      const current = await getPracticeConfig();
      await savePracticeConfig({ ...current, provider });
      return NextResponse.json({ ok: true });
    }

    if (entity === "settings") {
      const clinicianId = String(body.clinicianId ?? "");
      if (!clinicianId) return NextResponse.json({ error: "Missing clinician." }, { status: 400 });
      await upsertClinicianSettings({
        clinicianId,
        retentionPct: n(body.retentionPct),
        otherDeductionPct: n(body.otherDeductionPct),
        otherDeductionFixed: n(body.otherDeductionFixed),
        pension: n(body.pension),
        billerPct: n(body.billerPct),
        billerBasePct: body.billerBasePct === undefined ? 0 : n(body.billerBasePct),
        billerCommissionApplies: body.billerCommissionApplies === true,
        noPayout: body.noPayout === true,
      });
      return NextResponse.json({ ok: true });
    }

    // The biller sets ONLY their own % on a clinician — everything else (retention,
    // deductions, base) is untouched, and the % is always charged on the clinician's
    // after-retention share. Available to the biller and the owner.
    if (entity === "billerRate") {
      const clinicianId = String(body.clinicianId ?? "");
      if (!clinicianId) return NextResponse.json({ error: "Missing clinician." }, { status: 400 });
      const existing = await getClinicianSettings(clinicianId);
      await upsertClinicianSettings({ ...existing, billerPct: n(body.billerPct) });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown entity." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}
