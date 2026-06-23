import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { billingRoleOf, canConfigure } from "@/lib/billingRole";
import {
  upsertInsurer, deleteInsurer,
  upsertCptCode, deleteCptCode,
  upsertClinicianSettings,
  type CopayType,
} from "@/lib/billing";

const n = (v: unknown) => (v == null || v === "" ? 0 : Number(v));

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
      await upsertCptCode({ code, description: String(body.description ?? "").trim(), active: body.active !== false });
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
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown entity." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}
