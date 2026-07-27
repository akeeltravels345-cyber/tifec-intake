import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { billingRoleOf, canConfigure } from "@/lib/billingRole";
import {
  upsertInsurer, deleteInsurer,
  upsertCptCode, deleteCptCode,
  upsertClinicianSettings,
  savePracticeConfig, getPracticeConfig,
  type CopayType, type RunningExpense, type ProviderConfig,
} from "@/lib/billing";

const n = (v: unknown) => (v == null || v === "" ? 0 : Number(v));
const t = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export async function POST(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!canConfigure(billingRoleOf(me))) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const entity = String(body.entity ?? "");
  const action = String(body.action ?? "save");

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
      await upsertCptCode({ code, description: String(body.description ?? "").trim(), active: body.active !== false, fee: n(body.fee), hrs: n(body.hrs) });
      return NextResponse.json({ ok: true });
    }

    if (entity === "practice") {
      const expenses = Array.isArray(body.runningExpenses)
        ? (body.runningExpenses as Record<string, unknown>[]).map((e, i) => ({
            id: String(e.id || `exp-${i}`),
            name: String(e.name ?? "").trim() || "Expense",
            detail: String(e.detail ?? "").trim(),
            amount: n(e.amount),
            breakdown: Array.isArray(e.breakdown) ? (e.breakdown as Record<string, unknown>[]).map((b) => ({ label: String(b.label ?? ""), amount: n(b.amount) })) : undefined,
          })) as RunningExpense[]
        : [];
      // Preserve the provider block (saved separately) when writing biller % + expenses.
      const current = await getPracticeConfig();
      await savePracticeConfig({ ...current, billerCommissionPct: n(body.billerCommissionPct), runningExpenses: expenses });
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
        billerPct: n(body.billerPct),
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown entity." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}
