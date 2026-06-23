"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CopayType = "none" | "fixed" | "percentage";
interface Insurer { id: string; name: string; copayType: CopayType; copayRate: number; active: boolean; }
interface CptCode { code: string; description: string; active: boolean; }
interface ClinSetting { clinicianId: string; retentionPct: number; otherDeductionPct: number; otherDeductionFixed: number; }
interface ClinRef { id: string; name: string; }

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/billing/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not save.");
  return data;
}

function useSaver(router: ReturnType<typeof useRouter>) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async (body: Record<string, unknown>) => {
    setErr(""); setBusy(true);
    try { await post(body); router.refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setBusy(false); }
  };
  return { busy, err, run };
}

function InsurerRow({ insurer, isNew }: { insurer: Insurer; isNew?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(insurer.name);
  const [copayType, setCopayType] = useState<CopayType>(insurer.copayType);
  const [copayRate, setCopayRate] = useState(String(insurer.copayRate));
  const { busy, err, run } = useSaver(router);
  const save = () => run({ entity: "insurer", action: "save", id: isNew ? undefined : insurer.id, name, copayType, copayRate, active: true })
    .then(() => { if (isNew) { setName(""); setCopayRate("0"); } });
  return (
    <tr>
      <td><input value={name} placeholder="Insurer name" onChange={(e) => setName(e.target.value)} /></td>
      <td>
        <select value={copayType} onChange={(e) => setCopayType(e.target.value as CopayType)}>
          <option value="none">No co-pay</option>
          <option value="fixed">Fixed $</option>
          <option value="percentage">% of cost</option>
        </select>
      </td>
      <td><input type="number" step="0.01" min="0" style={{ maxWidth: 100 }} value={copayRate} disabled={copayType === "none"} onChange={(e) => setCopayRate(e.target.value)} /></td>
      <td className="bz-pay-action">
        <button className="primary bz-sm" disabled={busy || !name.trim()} onClick={save}>{isNew ? "Add" : "Save"}</button>
        {!isNew && <button className="bz-link bz-sm" disabled={busy} onClick={() => run({ entity: "insurer", action: "delete", id: insurer.id })}>Delete</button>}
        {err && <span className="bz-err">{err}</span>}
      </td>
    </tr>
  );
}

function CptRow({ cpt, isNew }: { cpt: CptCode; isNew?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState(cpt.code);
  const [description, setDescription] = useState(cpt.description);
  const { busy, err, run } = useSaver(router);
  const save = () => run({ entity: "cpt", action: "save", code, description, active: true })
    .then(() => { if (isNew) { setCode(""); setDescription(""); } });
  return (
    <tr>
      <td><input value={code} placeholder="90837" style={{ maxWidth: 110 }} disabled={!isNew} onChange={(e) => setCode(e.target.value)} /></td>
      <td><input value={description} placeholder="Description" onChange={(e) => setDescription(e.target.value)} /></td>
      <td className="bz-pay-action">
        <button className="primary bz-sm" disabled={busy || !code.trim()} onClick={save}>{isNew ? "Add" : "Save"}</button>
        {!isNew && <button className="bz-link bz-sm" disabled={busy} onClick={() => run({ entity: "cpt", action: "delete", code: cpt.code })}>Delete</button>}
        {err && <span className="bz-err">{err}</span>}
      </td>
    </tr>
  );
}

function ClinicianRow({ clin, setting }: { clin: ClinRef; setting: ClinSetting }) {
  const router = useRouter();
  const [retention, setRetention] = useState(String(setting.retentionPct));
  const [otherPct, setOtherPct] = useState(String(setting.otherDeductionPct));
  const [otherFixed, setOtherFixed] = useState(String(setting.otherDeductionFixed));
  const { busy, err, run } = useSaver(router);
  return (
    <tr>
      <td>{clin.name}</td>
      <td><input type="number" step="0.1" min="0" max="100" style={{ maxWidth: 90 }} value={retention} onChange={(e) => setRetention(e.target.value)} /></td>
      <td><input type="number" step="0.1" min="0" max="100" style={{ maxWidth: 90 }} value={otherPct} onChange={(e) => setOtherPct(e.target.value)} /></td>
      <td><input type="number" step="0.01" min="0" style={{ maxWidth: 100 }} value={otherFixed} onChange={(e) => setOtherFixed(e.target.value)} /></td>
      <td className="bz-pay-action">
        <button className="primary bz-sm" disabled={busy} onClick={() => run({ entity: "settings", clinicianId: clin.id, retentionPct: retention, otherDeductionPct: otherPct, otherDeductionFixed: otherFixed })}>Save</button>
        {err && <span className="bz-err">{err}</span>}
      </td>
    </tr>
  );
}

export default function ConfigClient({ insurers, cptCodes, clinicians, settings }: { insurers: Insurer[]; cptCodes: CptCode[]; clinicians: ClinRef[]; settings: ClinSetting[] }) {
  const settingFor = (id: string): ClinSetting => settings.find((s) => s.clinicianId === id) ?? { clinicianId: id, retentionPct: 0, otherDeductionPct: 0, otherDeductionFixed: 0 };
  const blankInsurer: Insurer = { id: "", name: "", copayType: "none", copayRate: 0, active: true };
  const blankCpt: CptCode = { code: "", description: "", active: true };

  return (
    <div className="bz-config">
      <section>
        <h3 className="bz-sec">Insurers &amp; co-pay rules</h3>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="bz-table">
            <thead><tr><th>Insurer</th><th>Co-pay type</th><th>Rate</th><th>Actions</th></tr></thead>
            <tbody>
              {insurers.map((i) => <InsurerRow key={i.id} insurer={i} />)}
              <InsurerRow insurer={blankInsurer} isNew />
            </tbody>
          </table>
        </div>
        <p className="help">Fixed = flat KYD amount. Percentage = share of the session cost. The co-pay auto-fills when a clinician logs a session, and stays editable.</p>
      </section>

      <section>
        <h3 className="bz-sec">CPT / service codes</h3>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="bz-table">
            <thead><tr><th>Code</th><th>Description</th><th>Actions</th></tr></thead>
            <tbody>
              {cptCodes.map((c) => <CptRow key={c.code} cpt={c} />)}
              <CptRow cpt={blankCpt} isNew />
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="bz-sec">Clinician retention &amp; deductions</h3>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="bz-table">
            <thead><tr><th>Clinician</th><th>Retention %</th><th>Other %</th><th>Fixed (KYD)</th><th>Actions</th></tr></thead>
            <tbody>
              {clinicians.map((c) => <ClinicianRow key={c.id} clin={c} setting={settingFor(c.id)} />)}
            </tbody>
          </table>
        </div>
        <p className="help">Retention is the share the practice keeps from each payout. Other % and the fixed amount are additional deductions applied to the month&apos;s paid revenue.</p>
      </section>
    </div>
  );
}
