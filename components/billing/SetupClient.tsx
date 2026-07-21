"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CopayType = "none" | "fixed" | "percentage";
interface Insurer { id: string; name: string; copayType: CopayType; copayRate: number; active: boolean; }
interface Cpt { code: string; description: string; fee: number; hrs: number; active: boolean; }
interface Setting { clinicianId: string; retentionPct: number; otherDeductionPct: number; otherDeductionFixed: number; billerPct: number; }
interface Expense { id: string; name: string; detail: string; amount: number; breakdown?: { label: string; amount: number }[]; }
interface ClinRef { id: string; name: string; }

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/billing/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed");
}

export default function SetupClient({ insurers: insIn, cptCodes: cptIn, clinicians, settings: setIn, billerPct: pctIn, expenses: expIn, billerName, billerInitials }: {
  insurers: Insurer[]; cptCodes: Cpt[]; clinicians: ClinRef[]; settings: Setting[];
  billerPct: number; expenses: Expense[]; billerName: string; billerInitials: string;
}) {
  const router = useRouter();
  const [toast, setToast] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 1800); router.refresh(); };
  const run = async (body: Record<string, unknown>, msg: string) => { try { await post(body); flash(msg); } catch (e) { setToast(e instanceof Error ? e.message : "Error"); setTimeout(() => setToast(""), 2200); } };

  // practice config (biller % + expenses) held together
  const [billerPct, setBillerPct] = useState(String(pctIn));
  const [expenses, setExpenses] = useState<Expense[]>(expIn);
  const savePractice = (pct: string, exp: Expense[], msg: string) => run({ entity: "practice", billerCommissionPct: Number(pct) || 0, runningExpenses: exp }, msg);
  const expTotal = expenses.reduce((t, e) => t + (Number(e.amount) || 0), 0);

  // local editable rows
  const [ins, setIns] = useState<Insurer[]>(insIn);
  const [newIns, setNewIns] = useState<Insurer>({ id: "", name: "", copayType: "none", copayRate: 0, active: true });
  const [cpt, setCpt] = useState<Cpt[]>(cptIn);
  const [newCpt, setNewCpt] = useState<Cpt>({ code: "", description: "", fee: 0, hrs: 1, active: true });
  const [sets, setSets] = useState<Record<string, Setting>>(Object.fromEntries(clinicians.map((c) => { const f = setIn.find((s) => s.clinicianId === c.id); return [c.id, { clinicianId: c.id, retentionPct: f?.retentionPct ?? 40, otherDeductionPct: f?.otherDeductionPct ?? 0, otherDeductionFixed: f?.otherDeductionFixed ?? 0, billerPct: f?.billerPct ?? 0 }]; })));

  const upd = <T,>(arr: T[], i: number, patch: Partial<T>) => arr.map((x, k) => (k === i ? { ...x, ...patch } : x));

  return (
    <>
      <div className="su-topbar"><h1 className="su-h1">Setup</h1><p className="su-sub">The money rules behind every payout — biller commission, running costs, insurers, codes, and clinician splits.</p></div>

      {/* Biller commission */}
      <div className="su-sec">
        <div className="su-sechead"><h2 className="su-sech">Biller commission</h2><span className="su-hint">A share of what the company retains on each clinician’s collections. Comes out of the practice’s retained share, never a clinician’s payout.</span></div>
        <div className="su-card su-comm">
          <div className="who"><div className="av">{billerInitials}</div><div><div className="nm">{billerName}</div><div className="rl">Biller · reconciles insurer remittances</div></div></div>
          <div className="rate">
            <div>
              <div className="ratebox"><input type="number" step="0.5" min="0" value={billerPct} onChange={(e) => setBillerPct(e.target.value)} onBlur={() => savePractice(billerPct, expenses, "Commission saved")} /><span className="pct">%</span></div>
              <div className="basis">of the company retention, on top of each clinician&apos;s own rate below</div>
            </div>
            <button className="su-save" onClick={() => savePractice(billerPct, expenses, "Commission saved")}>Save</button>
          </div>
        </div>
      </div>

      {/* Running expenses */}
      <div className="su-sec">
        <div className="su-sechead"><h2 className="su-sech">Running expenses<span className="su-tag">{money(expTotal)}/mo</span></h2><span className="su-hint">Fixed monthly overhead subtracted from collected cash to reach net profit.</span></div>
        <div className="su-card">
          <div className="su-tblwrap"><table className="su-tbl">
            <thead><tr><th>Expense</th><th>Detail</th><th className="num">Monthly</th><th></th></tr></thead>
            <tbody>
              {expenses.map((e, i) => (
                <tr key={e.id}>
                  <td className="nm"><input className="su-in" value={e.name} onChange={(ev) => setExpenses(upd(expenses, i, { name: ev.target.value }))} /></td>
                  <td><input className="su-in" value={e.detail} onChange={(ev) => setExpenses(upd(expenses, i, { detail: ev.target.value }))} /></td>
                  <td className="num"><input className="su-in short" type="number" step="0.01" value={e.amount} onChange={(ev) => setExpenses(upd(expenses, i, { amount: Number(ev.target.value) }))} /></td>
                  <td><div className="su-actions"><button className="su-del" onClick={() => { const next = expenses.filter((_, k) => k !== i); setExpenses(next); savePractice(billerPct, next, "Expense removed"); }}>Remove</button></div></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <button className="su-add" onClick={() => setExpenses([...expenses, { id: `exp-${Date.now()}`, name: "", detail: "", amount: 0 }])}>+ Add a cost</button>
          <div style={{ padding: "0 16px 16px", display: "flex", justifyContent: "flex-end" }}><button className="su-save" onClick={() => savePractice(billerPct, expenses, "Expenses saved")}>Save expenses</button></div>
        </div>
      </div>

      <div className="su-two">
        {/* Insurers */}
        <div className="su-sec">
          <div className="su-sechead"><h2 className="su-sech">Insurers &amp; co-pay</h2></div>
          <div className="su-card"><div className="su-tblwrap"><table className="su-tbl">
            <thead><tr><th>Insurer</th><th>Co-pay</th><th className="num">Rate</th><th></th></tr></thead>
            <tbody>
              {ins.map((x, i) => (
                <tr key={x.id}>
                  <td className="nm"><input className="su-in" value={x.name} onChange={(e) => setIns(upd(ins, i, { name: e.target.value }))} /></td>
                  <td><select className="su-sel" value={x.copayType} onChange={(e) => setIns(upd(ins, i, { copayType: e.target.value as CopayType }))}><option value="none">None</option><option value="fixed">Fixed $</option><option value="percentage">% of cost</option></select></td>
                  <td className="num"><input className="su-in short" type="number" step="0.01" value={x.copayRate} disabled={x.copayType === "none"} onChange={(e) => setIns(upd(ins, i, { copayRate: Number(e.target.value) }))} /></td>
                  <td><div className="su-actions"><button className="su-save" onClick={() => run({ entity: "insurer", id: x.id, name: x.name, copayType: x.copayType, copayRate: x.copayRate, active: true }, "Saved")}>Save</button><button className="su-del" onClick={() => run({ entity: "insurer", action: "delete", id: x.id }, "Removed")}>×</button></div></td>
                </tr>
              ))}
              <tr>
                <td><input className="su-in" placeholder="New insurer" value={newIns.name} onChange={(e) => setNewIns({ ...newIns, name: e.target.value })} /></td>
                <td><select className="su-sel" value={newIns.copayType} onChange={(e) => setNewIns({ ...newIns, copayType: e.target.value as CopayType })}><option value="none">None</option><option value="fixed">Fixed $</option><option value="percentage">% of cost</option></select></td>
                <td className="num"><input className="su-in short" type="number" step="0.01" value={newIns.copayRate} onChange={(e) => setNewIns({ ...newIns, copayRate: Number(e.target.value) })} /></td>
                <td><div className="su-actions"><button className="su-save" disabled={!newIns.name.trim()} onClick={() => { run({ entity: "insurer", name: newIns.name, copayType: newIns.copayType, copayRate: newIns.copayRate, active: true }, "Added"); setNewIns({ id: "", name: "", copayType: "none", copayRate: 0, active: true }); }}>Add</button></div></td>
              </tr>
            </tbody>
          </table></div></div>
        </div>

        {/* Service codes */}
        <div className="su-sec">
          <div className="su-sechead"><h2 className="su-sech">Service codes</h2></div>
          <div className="su-card"><div className="su-tblwrap"><table className="su-tbl">
            <thead><tr><th>Code</th><th>Description</th><th className="num">Fee</th><th className="num">Hrs</th><th></th></tr></thead>
            <tbody>
              {cpt.map((x, i) => (
                <tr key={x.code}>
                  <td className="nm">{x.code}</td>
                  <td><input className="su-in" value={x.description} onChange={(e) => setCpt(upd(cpt, i, { description: e.target.value }))} /></td>
                  <td className="num"><input className="su-in short" type="number" step="1" value={x.fee} onChange={(e) => setCpt(upd(cpt, i, { fee: Number(e.target.value) }))} /></td>
                  <td className="num"><input className="su-in short" style={{ maxWidth: 64 }} type="number" step="0.25" value={x.hrs} onChange={(e) => setCpt(upd(cpt, i, { hrs: Number(e.target.value) }))} /></td>
                  <td><div className="su-actions"><button className="su-save" onClick={() => run({ entity: "cpt", code: x.code, description: x.description, fee: x.fee, hrs: x.hrs, active: true }, "Saved")}>Save</button><button className="su-del" onClick={() => run({ entity: "cpt", action: "delete", code: x.code }, "Removed")}>×</button></div></td>
                </tr>
              ))}
              <tr>
                <td><input className="su-in short" placeholder="90XXX" value={newCpt.code} onChange={(e) => setNewCpt({ ...newCpt, code: e.target.value })} /></td>
                <td><input className="su-in" placeholder="Description" value={newCpt.description} onChange={(e) => setNewCpt({ ...newCpt, description: e.target.value })} /></td>
                <td className="num"><input className="su-in short" type="number" value={newCpt.fee} onChange={(e) => setNewCpt({ ...newCpt, fee: Number(e.target.value) })} /></td>
                <td className="num"><input className="su-in short" style={{ maxWidth: 64 }} type="number" step="0.25" value={newCpt.hrs} onChange={(e) => setNewCpt({ ...newCpt, hrs: Number(e.target.value) })} /></td>
                <td><div className="su-actions"><button className="su-save" disabled={!newCpt.code.trim()} onClick={() => { run({ entity: "cpt", code: newCpt.code, description: newCpt.description, fee: newCpt.fee, hrs: newCpt.hrs, active: true }, "Added"); setNewCpt({ code: "", description: "", fee: 0, hrs: 1, active: true }); }}>Add</button></div></td>
              </tr>
            </tbody>
          </table></div></div>
        </div>
      </div>

      {/* Clinician splits */}
      <div className="su-sec">
        <div className="su-sechead"><h2 className="su-sech">Clinician splits</h2><span className="su-hint">What the company keeps and what&apos;s deducted, per clinician. Payout = collected − retention − deductions. <b>Biller %</b> is this clinician&apos;s individual rate for the biller, charged on their insurance collected — on top of the practice rate above. Both come out of the company&apos;s share, never a clinician&apos;s payout.</span></div>
        <div className="su-card"><div className="su-tblwrap"><table className="su-tbl">
          <thead><tr><th>Clinician</th><th className="num">Retention %</th><th className="num">Other %</th><th className="num">Health (KYD)</th><th className="num">Biller %</th><th></th></tr></thead>
          <tbody>
            {clinicians.map((c) => { const s = sets[c.id]; return (
              <tr key={c.id}>
                <td className="nm">{c.name}</td>
                <td className="num"><input className="su-in short" type="number" step="0.5" value={s.retentionPct} onChange={(e) => setSets({ ...sets, [c.id]: { ...s, retentionPct: Number(e.target.value) } })} /></td>
                <td className="num"><input className="su-in short" type="number" step="0.5" value={s.otherDeductionPct} onChange={(e) => setSets({ ...sets, [c.id]: { ...s, otherDeductionPct: Number(e.target.value) } })} /></td>
                <td className="num"><input className="su-in short" type="number" step="1" value={s.otherDeductionFixed} onChange={(e) => setSets({ ...sets, [c.id]: { ...s, otherDeductionFixed: Number(e.target.value) } })} /></td>
                <td className="num"><input className="su-in short" type="number" step="0.5" min="0" max="100" value={s.billerPct} onChange={(e) => setSets({ ...sets, [c.id]: { ...s, billerPct: Number(e.target.value) } })} /></td>
                <td><div className="su-actions"><button className="su-save" onClick={() => run({ entity: "settings", clinicianId: c.id, retentionPct: s.retentionPct, otherDeductionPct: s.otherDeductionPct, otherDeductionFixed: s.otherDeductionFixed, billerPct: s.billerPct }, "Saved")}>Save</button></div></td>
              </tr>
            ); })}
          </tbody>
        </table></div></div>
      </div>

      {toast && <div className="su-toast">{toast}</div>}
    </>
  );
}
