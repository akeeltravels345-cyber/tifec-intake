"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Foldable from "./Foldable";

type CopayType = "none" | "fixed" | "percentage";
interface Insurer { id: string; name: string; copayType: CopayType; copayRate: number; active: boolean; claimCode?: string; }
interface CptVar { label: string; minutes: number; fee: number; }
interface Cpt { code: string; description: string; active: boolean; variants: CptVar[]; }
interface Setting { clinicianId: string; retentionPct: number; otherDeductionPct: number; otherDeductionFixed: number; pension: number; pensionPct: number; billerPct: number; billerBasePct: number; billerCommissionApplies: boolean; noPayout: boolean; }

/** A number field that holds its own text so you can fully clear it — fixes the
 *  "a 0 appears and won't delete" bug of a controlled type=number bound to a
 *  numeric state (Number("") coerces back to 0). Reports 0 when empty. */
function NumInput({ value, onChange, className = "su-in short", disabled, style }: {
  value: number; onChange: (n: number) => void; className?: string; disabled?: boolean; style?: React.CSSProperties;
}) {
  const [txt, setTxt] = useState(value === 0 ? "0" : String(value));
  return (
    <input
      className={className} type="text" inputMode="decimal" disabled={disabled} style={style}
      value={txt}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "" || /^-?\d*\.?\d*$/.test(v)) {
          setTxt(v);
          onChange(v === "" || v === "-" || v === "." ? 0 : Number(v));
        }
      }}
    />
  );
}
interface Expense { id: string; name: string; detail: string; amount: number; breakdown?: { label: string; amount: number }[]; }
interface ClinRef { id: string; name: string; }
interface Provider {
  practiceName?: string; npi?: string; ein?: string; taxonomy?: string;
  addressLine1?: string; addressLine2?: string; city?: string; region?: string; postal?: string; country?: string; phone?: string; email?: string; website?: string;
  renderingNpi?: Record<string, string>;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/billing/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed");
}

export default function SetupClient({ insurers: insIn, cptCodes: cptIn, clinicians, settings: setIn, billerPct: pctIn, processingFeePct: procIn = 0, isAdmin = false, isBillerUser = false, expenses: expIn, monthlyExpenses = {}, currentMonthKey, provider: provIn, renderingClinicians = [], billerName, billerInitials, canManageMoney = true, canSeeProvider = true }: {
  insurers: Insurer[]; cptCodes: Cpt[]; clinicians: ClinRef[]; settings: Setting[];
  billerPct: number; processingFeePct?: number; isAdmin?: boolean; expenses: Expense[]; provider?: Provider; renderingClinicians?: ClinRef[];
  /** Per-month expense snapshots (key "YYYY-MM"); the current month to default to. */
  monthlyExpenses?: Record<string, Expense[]>; currentMonthKey: string;
  billerName: string; billerInitials: string;
  /** Owner-only sections (commission, expenses, clinician splits) show only when true. */
  canManageMoney?: boolean;
  /** The biller sees a compact "my % per clinician" table. */
  isBillerUser?: boolean;
  /** Practice/provider details (CMS-1500) — biller + admin only, not the owner. */
  canSeeProvider?: boolean;
}) {
  const router = useRouter();
  const [toast, setToast] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 1800); router.refresh(); };
  const run = async (body: Record<string, unknown>, msg: string) => { try { await post(body); flash(msg); } catch (e) { setToast(e instanceof Error ? e.message : "Error"); setTimeout(() => setToast(""), 2200); } };

  // Practice / provider identifiers for CMS-1500 claims.
  const [prov, setProv] = useState<Provider>(provIn ?? {});
  const [rnpi, setRnpi] = useState<Record<string, string>>((provIn ?? {}).renderingNpi ?? {});
  const setP = (k: keyof Provider, v: string) => setProv((p) => ({ ...p, [k]: v }));
  const saveProvider = () => run({ entity: "provider", provider: { ...prov, renderingNpi: rnpi } }, "Practice details saved");
  const seedSamples = async (method: "POST" | "DELETE") => {
    try {
      const res = await fetch("/api/billing/seed-samples", { method });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      flash(method === "DELETE" ? `Removed ${j.removedClients} sample client(s)` : `Added ${j.created} sample clients`);
    } catch (e) { setToast(e instanceof Error ? e.message : "Error"); setTimeout(() => setToast(""), 2200); }
  };

  // Biller commission % (saved on its own — independent of expenses).
  const [billerPct, setBillerPct] = useState(String(pctIn));
  const saveCommission = (pct: string) => run({ entity: "practice", billerCommissionPct: Number(pct) || 0 }, "Commission saved");

  // Builder processing fee % (admin only) — % of total collected.
  const [procPct, setProcPct] = useState(String(procIn));
  const saveProcFee = (pct: string) => run({ entity: "practice", processingFeePct: Number(pct) || 0 }, "Processing fee saved");

  // Running expenses are PER MONTH: each month can carry its own set. A month with
  // no snapshot inherits the most recent earlier month's (or the base list).
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthLabel = (key: string) => { const [y, m] = key.split("-").map(Number); return `${MONTH_NAMES[m - 1]} ${y}`; };
  const shiftMonth = (key: string, delta: number) => { let [y, m] = key.split("-").map(Number); m += delta; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return `${y}-${String(m).padStart(2, "0")}`; };
  const resolveExpenses = (map: Record<string, Expense[]>, key: string): { list: Expense[]; source: "month" | "carried" | "base"; from?: string } => {
    if (map[key]) return { list: map[key], source: "month" };
    const earlier = Object.keys(map).filter((k) => k < key).sort();
    if (earlier.length) { const from = earlier[earlier.length - 1]; return { list: map[from], source: "carried", from }; }
    return { list: expIn, source: "base" };
  };
  const [expMap, setExpMap] = useState<Record<string, Expense[]>>(monthlyExpenses);
  const [expMonth, setExpMonth] = useState(currentMonthKey);
  const [expenses, setExpenses] = useState<Expense[]>(() => resolveExpenses(monthlyExpenses, currentMonthKey).list);
  const expResolved = resolveExpenses(expMap, expMonth);
  const goMonth = (delta: number) => { const nk = shiftMonth(expMonth, delta); setExpMonth(nk); setExpenses(resolveExpenses(expMap, nk).list); };
  const saveExpenses = (exp: Expense[]) => { setExpMap((m) => ({ ...m, [expMonth]: exp })); run({ entity: "practice", expenseMonth: expMonth, runningExpenses: exp }, `${monthLabel(expMonth)} expenses saved`); };
  const expTotal = expenses.reduce((t, e) => t + (Number(e.amount) || 0), 0);

  // local editable rows
  const [ins, setIns] = useState<Insurer[]>(insIn);
  const [newIns, setNewIns] = useState<Insurer>({ id: "", name: "", copayType: "none", copayRate: 0, active: true });
  const [cpt, setCpt] = useState<Cpt[]>(cptIn);
  const [newCpt, setNewCpt] = useState<Cpt>({ code: "", description: "", active: true, variants: [{ label: "", minutes: 60, fee: 0 }] });
  // Service-codes navigation: a search filter + which code is expanded to edit.
  const [cptQ, setCptQ] = useState("");
  const [openCode, setOpenCode] = useState<string | null>(null);
  const cptShown = cptQ.trim()
    ? cpt.filter((x) => x.code.toLowerCase().includes(cptQ.toLowerCase()) || x.description.toLowerCase().includes(cptQ.toLowerCase()))
    : cpt;
  const [sets, setSets] = useState<Record<string, Setting>>(Object.fromEntries(clinicians.map((c) => { const f = setIn.find((s) => s.clinicianId === c.id); return [c.id, { clinicianId: c.id, retentionPct: f?.retentionPct ?? 40, otherDeductionPct: f?.otherDeductionPct ?? 0, otherDeductionFixed: f?.otherDeductionFixed ?? 0, pension: f?.pension ?? 0, pensionPct: f?.pensionPct ?? 10, billerPct: f?.billerPct ?? 0, billerBasePct: f?.billerBasePct ?? 0, billerCommissionApplies: f?.billerCommissionApplies ?? false, noPayout: f?.noPayout ?? false }]; })));

  const upd = <T,>(arr: T[], i: number, patch: Partial<T>) => arr.map((x, k) => (k === i ? { ...x, ...patch } : x));

  return (
    <>
      <div className="su-topbar"><h1 className="su-h1">Setup</h1><p className="su-sub">{canManageMoney ? "The money rules behind every payout — biller commission, running costs, insurers, codes, and clinician splits." : "Insurers, claim codes, service fees, and the practice details that print on your CMS-1500 claims."}</p></div>

      {/* Biller's own % per clinician — biller only */}
      {isBillerUser && (
      <div className="su-sec">
        <div className="su-sechead"><h2 className="su-sech">My rates{billerName ? ` · ${billerName}` : ""}</h2><span className="su-hint">Your % per clinician. It&apos;s always charged on what each clinician <b>retains after the company&apos;s cut</b> (never on their co-pays) — so you only set the rate; the base is handled for you.</span></div>
        <div className="su-card"><Foldable unit="clinicians"><div className="su-tblwrap"><table className="su-tbl">
          <thead><tr><th>Clinician</th><th className="num">My %</th><th></th></tr></thead>
          <tbody>
            {clinicians.map((c) => { const s = sets[c.id]; return (
              <tr key={c.id}>
                <td className="nm">{c.name}</td>
                <td className="num"><NumInput value={s.billerPct} onChange={(v) => setSets({ ...sets, [c.id]: { ...s, billerPct: v } })} /></td>
                <td><div className="su-actions"><button className="su-save" onClick={() => run({ entity: "billerRate", clinicianId: c.id, billerPct: s.billerPct }, "Saved")}>Save</button></div></td>
              </tr>
            ); })}
          </tbody>
        </table></div></Foldable></div>
      </div>
      )}

      {/* Platform processing fee — the admin (builder) sets it; the owner sees it
          (read-only) since it's charged to the practice. Hidden from the biller. */}
      {(isAdmin || canManageMoney) && (
      <div className="su-sec">
        <div className="su-sechead"><h2 className="su-sech">Processing fee {isAdmin && <span className="su-tag">builder</span>}</h2><span className="su-hint">{isAdmin ? "Your platform fee as a % of total cash collected." : "The platform fee charged on every dollar the practice collects — set by your administrator."}</span></div>
        <div className="su-card su-comm">
          <div className="who"><div className="av" style={{ background: "linear-gradient(135deg,#7c5cff,#2E3192)" }}>%</div><div><div className="nm">Platform processing fee</div><div className="rl">% of total collected</div></div></div>
          <div className="rate">
            {isAdmin ? (
              <>
                <div><div className="ratebox"><input type="number" step="0.5" min="0" value={procPct} onChange={(e) => setProcPct(e.target.value)} onBlur={() => saveProcFee(procPct)} /><span className="pct">%</span></div><div className="basis">of every dollar the practice collects</div></div>
                <button className="su-save" onClick={() => saveProcFee(procPct)}>Save</button>
              </>
            ) : (
              <div><div className="ratebox readonly">{procPct || 0}<span className="pct">%</span></div><div className="basis">of every dollar the practice collects</div></div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Practice / provider details for CMS-1500 — biller + admin only */}
      {canSeeProvider && (
      <div className="su-sec">
        <div className="su-sechead"><h2 className="su-sech">Practice details (claims &amp; invoices)</h2><span className="su-hint">The billing-provider identifiers that print on every CMS-1500 (boxes 25, 32, 33) and each clinician&apos;s rendering NPI (box 24J), plus the name, address and contact details printed on self-pay invoices. Fill these once.</span></div>
        <div className="su-card cd-grid">
          <div className="cd-f"><span className="cd-fl">Practice name</span><input className="ls-in" value={prov.practiceName ?? ""} onChange={(e) => setP("practiceName", e.target.value)} /></div>
          <div className="cd-f"><span className="cd-fl">Phone</span><input className="ls-in" value={prov.phone ?? ""} onChange={(e) => setP("phone", e.target.value)} /></div>
          <div className="cd-f"><span className="cd-fl">Email (invoices)</span><input className="ls-in" value={prov.email ?? ""} onChange={(e) => setP("email", e.target.value)} /></div>
          <div className="cd-f"><span className="cd-fl">Website (invoices)</span><input className="ls-in" value={prov.website ?? ""} onChange={(e) => setP("website", e.target.value)} /></div>
          <div className="cd-f"><span className="cd-fl">Billing NPI (box 33a)</span><input className="ls-in" value={prov.npi ?? ""} onChange={(e) => setP("npi", e.target.value)} /></div>
          <div className="cd-f"><span className="cd-fl">Federal Tax ID / EIN (box 25)</span><input className="ls-in" value={prov.ein ?? ""} onChange={(e) => setP("ein", e.target.value)} /></div>
          <div className="cd-f"><span className="cd-fl">Taxonomy code</span><input className="ls-in" value={prov.taxonomy ?? ""} onChange={(e) => setP("taxonomy", e.target.value)} /></div>
          <div className="cd-f"><span className="cd-fl">Address line 1</span><input className="ls-in" value={prov.addressLine1 ?? ""} onChange={(e) => setP("addressLine1", e.target.value)} /></div>
          <div className="cd-f"><span className="cd-fl">Address line 2</span><input className="ls-in" value={prov.addressLine2 ?? ""} onChange={(e) => setP("addressLine2", e.target.value)} /></div>
          <div className="cd-f"><span className="cd-fl">City</span><input className="ls-in" value={prov.city ?? ""} onChange={(e) => setP("city", e.target.value)} /></div>
          <div className="cd-f"><span className="cd-fl">District / region</span><input className="ls-in" value={prov.region ?? ""} onChange={(e) => setP("region", e.target.value)} /></div>
          <div className="cd-f"><span className="cd-fl">Postal code</span><input className="ls-in" value={prov.postal ?? ""} onChange={(e) => setP("postal", e.target.value)} /></div>
          <div className="cd-f"><span className="cd-fl">Country</span><input className="ls-in" value={prov.country ?? ""} onChange={(e) => setP("country", e.target.value)} /></div>
          {renderingClinicians.length > 0 && (
            <div className="cd-f" style={{ gridColumn: "span 2" }}>
              <span className="cd-fl">Rendering NPI per clinician (box 24J)</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
                {renderingClinicians.map((c) => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <span style={{ minWidth: 130, color: "var(--muted)" }}>{c.name}</span>
                    <input className="ls-in" value={rnpi[c.id] ?? ""} onChange={(e) => setRnpi((m) => ({ ...m, [c.id]: e.target.value }))} placeholder="NPI" />
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="cd-save"><button className="su-save" onClick={saveProvider}>Save practice details</button></div>
        </div>
      </div>
      )}

      {/* Biller commission — owner only */}
      {canManageMoney && (<>
      <div className="su-sec">
        <div className="su-sechead"><h2 className="su-sech">Biller commission</h2><span className="su-hint">A share of what the company retains — but only for the clinicians it&apos;s agreed with (set that per clinician in the splits below). Comes out of the practice&apos;s retained share, never a clinician&apos;s payout.</span></div>
        <div className="su-card su-comm">
          <div className="who"><div className="av">{billerInitials}</div><div><div className="nm">{billerName}</div><div className="rl">Biller · reconciles insurer remittances</div></div></div>
          <div className="rate">
            <div>
              <div className="ratebox"><input type="number" step="0.5" min="0" value={billerPct} onChange={(e) => setBillerPct(e.target.value)} onBlur={() => saveCommission(billerPct)} /><span className="pct">%</span></div>
              <div className="basis">of the company retention, for the clinicians ticked in the splits below</div>
            </div>
            <button className="su-save" onClick={() => saveCommission(billerPct)}>Save</button>
          </div>
        </div>
      </div>

      {/* Running expenses — per month */}
      <div className="su-sec">
        <div className="su-sechead"><h2 className="su-sech">Running expenses<span className="su-tag">{money(expTotal)}/mo</span></h2><span className="su-hint">Monthly overhead subtracted from collected cash to reach net profit. Costs change month to month — set each month&apos;s here.</span></div>
        <div className="su-card">
          <div className="su-expbar">
            <div className="su-monthnav">
              <button className="su-mbtn" onClick={() => goMonth(-1)} aria-label="Previous month">‹</button>
              <span className="su-monthlbl">{monthLabel(expMonth)}</span>
              <button className="su-mbtn" onClick={() => goMonth(1)} aria-label="Next month">›</button>
            </div>
            <span className="su-expsrc">
              {expResolved.source === "month" ? "This month has its own set"
                : expResolved.source === "carried" ? `Carried forward from ${monthLabel(expResolved.from!)} — Save to make it this month's own`
                : "Showing the default set — Save to make it this month's own"}
            </span>
          </div>
          <div className="su-tblwrap"><table className="su-tbl su-exptbl">
            <thead><tr><th>Expense</th><th>Detail</th><th className="num">Monthly</th><th aria-label="Remove"></th></tr></thead>
            <tbody>
              {expenses.length === 0 && (
                <tr><td colSpan={4} className="su-expempty">No costs yet — add your rent, software, utilities and so on below.</td></tr>
              )}
              {expenses.map((e, i) => (
                <tr key={e.id}>
                  <td className="nm"><input className="su-in" placeholder="e.g. Rent" value={e.name} onChange={(ev) => setExpenses(upd(expenses, i, { name: ev.target.value }))} /></td>
                  <td><input className="su-in" placeholder="optional note" value={e.detail} onChange={(ev) => setExpenses(upd(expenses, i, { detail: ev.target.value }))} /></td>
                  <td className="num"><div className="su-money"><span className="cur">$</span><NumInput className="su-moneyin" value={e.amount} onChange={(v) => setExpenses(upd(expenses, i, { amount: v }))} /></div></td>
                  <td className="act"><button className="su-rm" aria-label={`Remove ${e.name || "cost"}`} title="Remove" onClick={() => { const next = expenses.filter((_, k) => k !== i); setExpenses(next); saveExpenses(next); }}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <button className="su-add" onClick={() => setExpenses([...expenses, { id: `exp-${Date.now()}`, name: "", detail: "", amount: 0 }])}>+ Add a cost</button>
          <div style={{ padding: "0 16px 16px", display: "flex", justifyContent: "flex-end" }}><button className="su-save" onClick={() => saveExpenses(expenses)}>Save {monthLabel(expMonth)} expenses</button></div>
        </div>
      </div>
      </>)}

      <div className="su-two">
        {/* Insurers */}
        <div className="su-sec">
          <div className="su-sechead"><h2 className="su-sech">Insurers &amp; co-pay</h2></div>
          <div className="su-card"><Foldable unit="insurers" rowSelector="tbody > tr:not(:last-child)"><div className="su-tblwrap"><table className="su-tbl">
            <thead><tr><th className="grow">Insurer</th><th>Co-pay</th><th className="num">Rate</th><th>Claim code</th><th></th></tr></thead>
            <tbody>
              {ins.map((x, i) => (
                <tr key={x.id}>
                  <td className="nm grow"><input className="su-in" value={x.name} onChange={(e) => setIns(upd(ins, i, { name: e.target.value }))} /></td>
                  <td><select className="su-sel" value={x.copayType} onChange={(e) => setIns(upd(ins, i, { copayType: e.target.value as CopayType }))}><option value="none">None</option><option value="fixed">Fixed $</option><option value="percentage">% of cost</option></select></td>
                  <td className="num"><NumInput className="su-in numwide" value={x.copayRate} disabled={x.copayType === "none"} onChange={(v) => setIns(upd(ins, i, { copayRate: v }))} /></td>
                  <td><input className="su-in short" placeholder="e.g. 362" value={x.claimCode ?? ""} onChange={(e) => setIns(upd(ins, i, { claimCode: e.target.value }))} /></td>
                  <td><div className="su-actions"><button className="su-save" onClick={() => run({ entity: "insurer", id: x.id, name: x.name, copayType: x.copayType, copayRate: x.copayRate, claimCode: x.claimCode ?? "", active: true }, "Saved")}>Save</button><button className="su-del" onClick={() => run({ entity: "insurer", action: "delete", id: x.id }, "Removed")}>×</button></div></td>
                </tr>
              ))}
              <tr>
                <td className="grow"><input className="su-in" placeholder="New insurer" value={newIns.name} onChange={(e) => setNewIns({ ...newIns, name: e.target.value })} /></td>
                <td><select className="su-sel" value={newIns.copayType} onChange={(e) => setNewIns({ ...newIns, copayType: e.target.value as CopayType })}><option value="none">None</option><option value="fixed">Fixed $</option><option value="percentage">% of cost</option></select></td>
                <td className="num"><NumInput className="su-in numwide" value={newIns.copayRate} onChange={(v) => setNewIns({ ...newIns, copayRate: v })} /></td>
                <td><input className="su-in short" placeholder="e.g. 362" value={newIns.claimCode ?? ""} onChange={(e) => setNewIns({ ...newIns, claimCode: e.target.value })} /></td>
                <td><div className="su-actions"><button className="su-save" disabled={!newIns.name.trim()} onClick={() => { run({ entity: "insurer", name: newIns.name, copayType: newIns.copayType, copayRate: newIns.copayRate, claimCode: newIns.claimCode ?? "", active: true }, "Added"); setNewIns({ id: "", name: "", copayType: "none", copayRate: 0, active: true }); }}>Add</button></div></td>
              </tr>
            </tbody>
          </table></div></Foldable></div>
        </div>

        {/* Service codes — each can hold several time / value options */}
        <div className="su-sec">
          <div className="su-sechead"><h2 className="su-sech">Service codes</h2><span className="su-hint">A code can hold several time &amp; value options (e.g. 90834 at 45 min and a 15-min slot). The first is the default.</span></div>
          <div className="su-card">
            <div className="su-cpttools">
              <input className="su-in su-cptsearch" placeholder={`Search ${cpt.length} codes — number or name`} value={cptQ} onChange={(e) => setCptQ(e.target.value)} />
            </div>
            <div className="su-cptscroll">
              {cptShown.length === 0 ? (
                <div className="su-expempty">No code matches &ldquo;{cptQ}&rdquo;.</div>
              ) : cptShown.map((x) => {
                const i = cpt.indexOf(x);
                const setVar = (vi: number, patch: Partial<CptVar>) => setCpt(upd(cpt, i, { variants: x.variants.map((v, k) => (k === vi ? { ...v, ...patch } : v)) }));
                const open = openCode === x.code;
                const def = x.variants[0];
                return (
                  <div className={`su-cptrow ${open ? "open" : ""}`} key={x.code}>
                    <button type="button" className="su-cpthead" onClick={() => setOpenCode(open ? null : x.code)} aria-expanded={open}>
                      <span className="su-cptcode">{x.code}</span>
                      <span className="su-cptdesc">{x.description || <span className="su-cptdesc-empty">No description</span>}</span>
                      {x.variants.length > 1 && <span className="su-cptopts">{x.variants.length} options</span>}
                      <span className="su-cptfee">{money(def?.fee || 0)}</span>
                      <span className="su-cptchev" aria-hidden="true">›</span>
                    </button>
                    {open && (
                      <div className="su-cptedit">
                        <label className="su-editlab">Description</label>
                        <input className="su-in" value={x.description} placeholder="e.g. Psychotherapy, 60 min" onChange={(e) => setCpt(upd(cpt, i, { description: e.target.value }))} />
                        <label className="su-editlab">Time &amp; value options <span className="su-editnote">first is the default</span></label>
                        <div className="su-cptvars">
                          {x.variants.map((v, vi) => (
                            <div className="su-cptvar" key={vi}>
                              <input className="su-in" placeholder="Label (e.g. 45 min)" value={v.label} onChange={(e) => setVar(vi, { label: e.target.value })} />
                              <label className="su-varlab">Minutes<NumInput className="su-varnum" value={v.minutes} onChange={(n) => setVar(vi, { minutes: n })} /></label>
                              <label className="su-varlab">Fee<span className="su-money sm"><span className="cur">$</span><NumInput className="su-moneyin" value={v.fee} onChange={(n) => setVar(vi, { fee: n })} /></span></label>
                              {vi === 0 ? <span className="su-vardefault">default</span> : <button className="su-rm" onClick={() => setCpt(upd(cpt, i, { variants: x.variants.filter((_, k) => k !== vi) }))}>Remove</button>}
                            </div>
                          ))}
                          <button className="su-add sm" onClick={() => setCpt(upd(cpt, i, { variants: [...x.variants, { label: "", minutes: 30, fee: 0 }] }))}>+ add an option</button>
                        </div>
                        <div className="su-cptedit-actions">
                          <button className="su-rm" onClick={() => run({ entity: "cpt", action: "delete", code: x.code }, "Removed")}>Delete code</button>
                          <button className="su-save" onClick={() => run({ entity: "cpt", code: x.code, description: x.description, active: true, variants: x.variants }, "Saved")}>Save changes</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Add a new code */}
            <div className="su-cptcard new">
              <div className="su-cpttop">
                <input className="su-in short" placeholder="90XXX" value={newCpt.code} onChange={(e) => setNewCpt({ ...newCpt, code: e.target.value })} />
                <input className="su-in" placeholder="Description" value={newCpt.description} onChange={(e) => setNewCpt({ ...newCpt, description: e.target.value })} />
                <button className="su-save" disabled={!newCpt.code.trim()} onClick={() => { run({ entity: "cpt", code: newCpt.code, description: newCpt.description, active: true, variants: newCpt.variants }, "Added"); setNewCpt({ code: "", description: "", active: true, variants: [{ label: "", minutes: 60, fee: 0 }] }); }}>Add</button>
              </div>
              <div className="su-cptvars">
                {newCpt.variants.map((v, vi) => (
                  <div className="su-cptvar" key={vi}>
                    <input className="su-in" placeholder="Label (e.g. 45 min)" value={v.label} onChange={(e) => setNewCpt({ ...newCpt, variants: newCpt.variants.map((y, k) => (k === vi ? { ...y, label: e.target.value } : y)) })} />
                    <label className="su-varlab">min<NumInput style={{ minWidth: 60, maxWidth: 74 }} value={v.minutes} onChange={(n) => setNewCpt({ ...newCpt, variants: newCpt.variants.map((y, k) => (k === vi ? { ...y, minutes: n } : y)) })} /></label>
                    <label className="su-varlab">$<NumInput className="su-in numwide" value={v.fee} onChange={(n) => setNewCpt({ ...newCpt, variants: newCpt.variants.map((y, k) => (k === vi ? { ...y, fee: n } : y)) })} /></label>
                    {vi === 0 ? <span className="su-vardefault">default</span> : <button className="su-del" onClick={() => setNewCpt({ ...newCpt, variants: newCpt.variants.filter((_, k) => k !== vi) })}>×</button>}
                  </div>
                ))}
                <button className="su-add sm" onClick={() => setNewCpt({ ...newCpt, variants: [...newCpt.variants, { label: "", minutes: 30, fee: 0 }] })}>+ time / value option</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Clinician splits — owner only */}
      {canManageMoney && (
      <div className="su-sec">
        <div className="su-sechead"><h2 className="su-sech">Clinician splits</h2><span className="su-hint">What the company keeps and what&apos;s deducted, per clinician. Payout = collected − retention − deductions. <b>Biller %</b> is this clinician&apos;s individual rate for the biller, charged on their insurance collected. <b>Base %</b> is the share the biller rate is charged on — leave <b>0</b> for auto (the clinician&apos;s after-retention share, i.e. what they actually receive), or set an explicit % for a special deal (Nick bills Joan on 70% of hers). <b>Practice {billerPct}%</b> ticks whether the practice-wide biller commission also applies. All come out of the company&apos;s share, never a clinician&apos;s payout. <b>Pension %</b> is charged on each clinician&apos;s after-retention share (what they keep once the company retention comes out), so the dollar figure moves with what they collect. Default 10 — change it here per clinician.</span></div>
        <div className="su-card"><Foldable unit="clinicians"><div className="su-tblwrap"><table className="su-tbl">
          <thead><tr><th>Clinician</th><th className="num">Retention %</th><th className="num">Other %</th><th className="num">Health (KYD)</th><th className="num">Pension %</th><th className="num">Biller %</th><th className="num">Base %</th><th className="num">Practice {billerPct}%</th><th className="num">No payout</th><th></th></tr></thead>
          <tbody>
            {clinicians.map((c) => { const s = sets[c.id]; return (
              <tr key={c.id}>
                <td className="nm">{c.name}</td>
                <td className="num">{s.noPayout ? <span className="su-na">—</span> : <NumInput value={s.retentionPct} onChange={(v) => setSets({ ...sets, [c.id]: { ...s, retentionPct: v } })} />}</td>
                <td className="num">{s.noPayout ? <span className="su-na">—</span> : <NumInput value={s.otherDeductionPct} onChange={(v) => setSets({ ...sets, [c.id]: { ...s, otherDeductionPct: v } })} />}</td>
                <td className="num">{s.noPayout ? <span className="su-na">—</span> : <NumInput value={s.otherDeductionFixed} onChange={(v) => setSets({ ...sets, [c.id]: { ...s, otherDeductionFixed: v } })} />}</td>
                <td className="num">{s.noPayout ? <span className="su-na">—</span> : <NumInput value={s.pensionPct} onChange={(v) => setSets({ ...sets, [c.id]: { ...s, pensionPct: v } })} />}</td>
                <td className="num"><NumInput value={s.billerPct} onChange={(v) => setSets({ ...sets, [c.id]: { ...s, billerPct: v } })} /></td>
                <td className="num"><NumInput value={s.billerBasePct} onChange={(v) => setSets({ ...sets, [c.id]: { ...s, billerBasePct: v } })} /></td>
                <td className="num"><input type="checkbox" className="su-check" checked={s.billerCommissionApplies} onChange={(e) => setSets({ ...sets, [c.id]: { ...s, billerCommissionApplies: e.target.checked } })} /></td>
                <td className="num"><input type="checkbox" className="su-check" checked={s.noPayout} onChange={(e) => setSets({ ...sets, [c.id]: { ...s, noPayout: e.target.checked } })} title="Owner draws no payout — collections stay with the practice" /></td>
                <td><div className="su-actions"><button className="su-save" onClick={() => run({ entity: "settings", clinicianId: c.id, retentionPct: s.retentionPct, otherDeductionPct: s.otherDeductionPct, otherDeductionFixed: s.otherDeductionFixed, pension: s.pension, pensionPct: s.pensionPct, billerPct: s.billerPct, billerBasePct: s.billerBasePct, billerCommissionApplies: s.billerCommissionApplies, noPayout: s.noPayout }, "Saved")}>Save</button></div></td>
              </tr>
            ); })}
          </tbody>
        </table></div></Foldable></div>
      </div>
      )}

      {/* Sample data */}
      <div className="su-sec">
        <div className="su-sechead"><h2 className="su-sech">Sample data</h2><span className="su-hint">Add a handful of clearly-fake clients (spread across clinicians, with claims at each stage) so the billing screens can be seen populated. Remove them anytime — real clients are never touched.</span></div>
        <div className="su-card" style={{ padding: 16, display: "flex", gap: 10 }}>
          <button className="su-save" onClick={() => seedSamples("POST")}>Add sample clients</button>
          <button className="su-del" onClick={() => seedSamples("DELETE")}>Remove sample clients</button>
        </div>
      </div>

      {toast && <div className="su-toast">{toast}</div>}
    </>
  );
}
