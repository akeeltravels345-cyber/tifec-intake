"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type CopayType = "none" | "fixed" | "percentage";
interface Insurer { id: string; name: string; copayType: CopayType; copayRate: number; active: boolean; claimCode?: string; billStyle?: "claim" | "invoice"; email?: string; }
interface CptVar { label: string; minutes: number; fee: number; }
interface Cpt { code: string; description: string; active: boolean; variants: CptVar[]; }
interface Setting { clinicianId: string; retentionPct: number; otherDeductionPct: number; otherDeductionFixed: number; pension: number; pensionPct: number; billerPct: number; billerBasePct: number; billerCommissionApplies: boolean; noPayout: boolean; }

/** A number field that holds its own text so you can fully clear it — fixes the
 *  "a 0 appears and won't delete" bug of a controlled type=number bound to a
 *  numeric state (Number("") coerces back to 0). Reports 0 when empty. */
function NumInput({ value, onChange, className = "set-num", disabled, style }: {
  value: number; onChange: (n: number) => void; className?: string; disabled?: boolean; style?: React.CSSProperties;
}) {
  const [txt, setTxt] = useState(value === 0 ? "0" : String(value));
  // Re-sync the display when `value` is changed from OUTSIDE (Discard revert, or
  // the post-save refresh) — but only while unfocused, so typing (including a
  // lone "." or clearing to empty) is never fought mid-edit.
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current && Number(txt || 0) !== value) setTxt(value === 0 ? "0" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      className={className} type="text" inputMode="decimal" disabled={disabled} style={style}
      value={txt}
      onFocus={(e) => { focused.current = true; e.currentTarget.select(); }}
      onBlur={() => { focused.current = false; }}
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
  claimsReplyToName?: string; claimsReplyToEmail?: string;
  renderingNpi?: Record<string, string>;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const initials = (name: string) => {
  const p = name.replace(/^(Dr\.?|Mrs\.?|Mr\.?|Ms\.?|Miss)\s+/i, "").trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || (name[0] ?? "?").toUpperCase();
};
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

  // ---- Pending-change tracking for the single "Save all" bar --------------------
  // A field edit records only its entity KEY; Save all rebuilds each payload from
  // CURRENT state (identical to the old per-row Save), so nothing is ever dropped
  // or reset — only what you changed is written, and with its complete values.
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const touch = (k: string) => setDirty((d) => (d.has(k) ? d : new Set(d).add(k)));

  // Practice / provider identifiers for CMS-1500 claims.
  const [prov, setProv] = useState<Provider>(provIn ?? {});
  const [rnpi, setRnpi] = useState<Record<string, string>>((provIn ?? {}).renderingNpi ?? {});
  const setP = (k: keyof Provider, v: string) => { setProv((p) => ({ ...p, [k]: v })); touch("provider"); };
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
  // Builder processing fee % (admin only) — % of total collected.
  const [procPct, setProcPct] = useState(String(procIn));

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
  const editExpenses = (next: Expense[]) => { setExpenses(next); touch("expenses"); };
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
  const makeSets = (): Record<string, Setting> => Object.fromEntries(clinicians.map((c) => { const f = setIn.find((s) => s.clinicianId === c.id); return [c.id, { clinicianId: c.id, retentionPct: f?.retentionPct ?? 40, otherDeductionPct: f?.otherDeductionPct ?? 0, otherDeductionFixed: f?.otherDeductionFixed ?? 0, pension: f?.pension ?? 0, pensionPct: f?.pensionPct ?? 10, billerPct: f?.billerPct ?? 0, billerBasePct: f?.billerBasePct ?? 0, billerCommissionApplies: f?.billerCommissionApplies ?? false, noPayout: f?.noPayout ?? false }]; }));
  const [sets, setSets] = useState<Record<string, Setting>>(makeSets);
  const [selClin, setSelClin] = useState<string>(clinicians[0]?.id ?? "");

  const upd = <T,>(arr: T[], i: number, patch: Partial<T>) => arr.map((x, k) => (k === i ? { ...x, ...patch } : x));

  // ---- Which sections this user sees (drives the rail + the content pane) --------
  type SecId = "rates" | "procfee" | "commission" | "expenses" | "insurers" | "codes" | "practice" | "splits" | "samples";
  const SECTIONS: { id: SecId; group: string; label: string; tag?: string }[] = [
    isBillerUser ? { id: "rates" as const, group: "Money", label: "My rates" } : null,
    (isAdmin || canManageMoney) ? { id: "procfee" as const, group: "Money", label: "Processing fee", tag: isAdmin ? "builder" : undefined } : null,
    canManageMoney ? { id: "commission" as const, group: "Money", label: "Biller commission" } : null,
    canManageMoney ? { id: "expenses" as const, group: "Money", label: "Running expenses" } : null,
    { id: "insurers" as const, group: "Claims", label: "Insurers & co-pay" },
    { id: "codes" as const, group: "Claims", label: "Service codes" },
    canSeeProvider ? { id: "practice" as const, group: "Claims", label: "Practice details" } : null,
    canManageMoney ? { id: "splits" as const, group: "Payout", label: "Clinician splits" } : null,
    { id: "samples" as const, group: "Setup", label: "Sample data" },
  ].filter(Boolean) as { id: SecId; group: string; label: string; tag?: string }[];
  const [section, setSection] = useState<SecId>(SECTIONS[0]?.id ?? "insurers");
  const GROUPS = ["Money", "Claims", "Payout", "Setup"].filter((g) => SECTIONS.some((s) => s.group === g));

  const keySection = (k: string): SecId | "" =>
    k === "procFee" ? "procfee" : k === "commission" ? "commission" : k === "provider" ? "practice"
    : k === "expenses" ? "expenses" : k.startsWith("ins:") ? "insurers" : k.startsWith("cpt:") ? "codes"
    : k.startsWith("settings:") ? "splits" : k.startsWith("billerRate:") ? "rates" : "";
  const sectionDirty = (id: SecId) => [...dirty].some((k) => keySection(k) === id);

  // Rebuild the exact payload for one dirty key from CURRENT state — the same body
  // the old per-row Save sent. Returns an optional onSaved side-effect (expenses).
  const buildBody = (k: string): { body: Record<string, unknown>; onSaved?: () => void } | null => {
    if (k === "procFee") return { body: { entity: "practice", processingFeePct: Number(procPct) || 0 } };
    if (k === "commission") return { body: { entity: "practice", billerCommissionPct: Number(billerPct) || 0 } };
    if (k === "provider") return { body: { entity: "provider", provider: { ...prov, renderingNpi: rnpi } } };
    if (k === "expenses") return { body: { entity: "practice", expenseMonth: expMonth, runningExpenses: expenses }, onSaved: () => setExpMap((m) => ({ ...m, [expMonth]: expenses })) };
    if (k.startsWith("ins:")) { const x = ins.find((i) => i.id === k.slice(4)); if (!x) return null; return { body: { entity: "insurer", id: x.id, name: x.name, copayType: x.copayType, copayRate: x.copayRate, claimCode: x.claimCode ?? "", billStyle: x.billStyle === "invoice" ? "invoice" : "claim", email: x.email ?? "", active: true } }; }
    if (k.startsWith("billerRate:")) { const id = k.slice(11); const s = sets[id]; if (!s) return null; return { body: { entity: "billerRate", clinicianId: id, billerPct: s.billerPct } }; }
    if (k.startsWith("cpt:")) { const x = cpt.find((c) => c.code === k.slice(4)); if (!x) return null; return { body: { entity: "cpt", code: x.code, description: x.description, active: true, variants: x.variants } }; }
    if (k.startsWith("settings:")) { const id = k.slice(9); const s = sets[id]; if (!s) return null; return { body: { entity: "settings", clinicianId: id, retentionPct: s.retentionPct, otherDeductionPct: s.otherDeductionPct, otherDeductionFixed: s.otherDeductionFixed, pension: s.pension, pensionPct: s.pensionPct, billerPct: s.billerPct, billerBasePct: s.billerBasePct, billerCommissionApplies: s.billerCommissionApplies, noPayout: s.noPayout } }; }
    return null;
  };

  const [saving, setSaving] = useState(false);
  const saveAll = async () => {
    const keys = [...dirty];
    if (keys.length === 0) return;
    setSaving(true);
    let ok = 0; const failed: string[] = [];
    for (const k of keys) {
      const b = buildBody(k);
      if (!b) { setDirty((d) => { const n = new Set(d); n.delete(k); return n; }); continue; }
      try { await post(b.body); b.onSaved?.(); ok++; setDirty((d) => { const n = new Set(d); n.delete(k); return n; }); }
      catch { failed.push(k); }
    }
    setSaving(false);
    setToast(failed.length ? `${ok} saved · ${failed.length} failed — try again` : ok === 1 ? "Change saved" : `All ${ok} changes saved`);
    setTimeout(() => setToast(""), failed.length ? 2600 : 1800);
    router.refresh();
  };
  const discardAll = () => {
    setProv(provIn ?? {}); setRnpi((provIn ?? {}).renderingNpi ?? {});
    setBillerPct(String(pctIn)); setProcPct(String(procIn));
    setExpMap(monthlyExpenses); setExpenses(resolveExpenses(monthlyExpenses, expMonth).list);
    setIns(insIn); setCpt(cptIn); setSets(makeSets());
    setDirty(new Set());
    setToast("Changes discarded"); setTimeout(() => setToast(""), 1600);
  };

  const dirtyCount = dirty.size;
  const practiceName = prov.practiceName || "Cayman Essential Care";
  const practiceInitials = practiceName.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const icon = (id: SecId) => {
    const p: Record<SecId, React.ReactNode> = {
      rates: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
      procfee: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
      commission: <><path d="M3 10l9-6 9 6M5 9v10h14V9" /></>,
      expenses: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></>,
      insurers: <><path d="M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h8" /></>,
      codes: <><path d="M9 3h6l5 5v13H4V3zM14 3v5h5" /></>,
      practice: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v16" /></>,
      splits: <><path d="M16 3.1a4 4 0 0 1 0 7.8M22 21v-2a4 4 0 0 0-3-3.9M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" /></>,
      samples: <><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2 4-4" /></>,
    };
    return <svg viewBox="0 0 24 24" aria-hidden="true">{p[id]}</svg>;
  };

  const sel = sets[selClin];

  return (
    <div className="set-wrap">
      <div className="set-top">
        <div><h1 className="set-h1">Setup</h1><p className="set-sub">{canManageMoney ? "The money rules behind every payout — commission, running costs, insurers, codes and clinician splits." : "Insurers, claim codes, service fees, and the practice details that print on your CMS-1500 claims."}</p></div>
        <div className="set-prac"><span className="set-mk">{practiceInitials}</span><div><b>{practiceName}</b><span>Practice settings</span></div></div>
      </div>

      <div className="set-shell">
        <nav className="set-rail">
          {GROUPS.map((g) => (
            <div key={g} className="set-railgrp">
              <div className="set-grp">{g}</div>
              {SECTIONS.filter((s) => s.group === g).map((s) => (
                <button key={s.id} type="button" className={`set-nav ${section === s.id ? "on" : ""}`} onClick={() => setSection(s.id)}>
                  {icon(s.id)}
                  <span className="set-navlbl">{s.label}</span>
                  {s.tag && <span className="set-navtag">{s.tag}</span>}
                  {sectionDirty(s.id) && <span className="set-navdot" title="Unsaved changes" />}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="set-content">
          {/* My rates — biller only */}
          {section === "rates" && (
            <section>
              <div className="set-sechead"><h2>My rates{billerName ? ` · ${billerName}` : ""}</h2><p>Your % per clinician. It&apos;s always charged on what each clinician <b>retains after the company&apos;s cut</b> (never on their co-pays) — so you only set the rate; the base is handled for you.</p></div>
              <div className="set-card">
                <div className="set-tblwrap"><table className="set-tbl">
                  <thead><tr><th>Clinician</th><th className="num">My %</th></tr></thead>
                  <tbody>
                    {clinicians.map((c) => { const s = sets[c.id]; return (
                      <tr key={c.id}>
                        <td><span className="set-rowname"><span className="set-av sm">{initials(c.name)}</span>{c.name}</span></td>
                        <td className="num"><span className="set-pctcell"><NumInput value={s.billerPct} onChange={(v) => { setSets({ ...sets, [c.id]: { ...s, billerPct: v } }); touch(`billerRate:${c.id}`); }} /><span className="set-u">%</span></span></td>
                      </tr>
                    ); })}
                  </tbody>
                </table></div>
              </div>
            </section>
          )}

          {/* Processing fee — admin editable, owner read-only */}
          {section === "procfee" && (
            <section>
              <div className="set-sechead"><h2>Processing fee {isAdmin && <span className="set-pill gold">builder</span>}</h2><p>{isAdmin ? "Your platform fee as a % of total cash collected." : "The platform fee charged on every dollar the practice collects — set by your administrator."}</p></div>
              <div className="set-card set-onecard">
                <div className="set-who"><span className="set-av indigo">%</span><div><div className="set-whonm">Platform processing fee</div><div className="set-whorl">% of total collected</div></div></div>
                <div className="set-rate">
                  {isAdmin ? (
                    <span className="set-inwrap"><NumInput className="set-ratein" value={Number(procPct) || 0} onChange={(v) => { setProcPct(String(v)); touch("procFee"); }} /><span className="set-u">%</span></span>
                  ) : (
                    <span className="set-inwrap readonly">{procPct || 0}<span className="set-u">%</span></span>
                  )}
                  <span className="set-basis">of every dollar the practice collects</span>
                </div>
              </div>
            </section>
          )}

          {/* Biller commission — owner only */}
          {section === "commission" && (
            <section>
              <div className="set-sechead"><h2>Biller commission</h2><p>A share of what the company retains — but only for the clinicians it&apos;s agreed with (tick that per clinician in Clinician splits). Comes out of the practice&apos;s retained share, never a clinician&apos;s payout.</p></div>
              <div className="set-card set-onecard">
                <div className="set-who"><span className="set-av teal">{billerInitials}</span><div><div className="set-whonm">{billerName}</div><div className="set-whorl">Biller · reconciles insurer remittances</div></div></div>
                <div className="set-rate">
                  <span className="set-inwrap"><NumInput className="set-ratein" value={Number(billerPct) || 0} onChange={(v) => { setBillerPct(String(v)); touch("commission"); }} /><span className="set-u">%</span></span>
                  <span className="set-basis">of the company retention, for the clinicians ticked in splits</span>
                </div>
              </div>
            </section>
          )}

          {/* Running expenses — per month */}
          {section === "expenses" && (
            <section>
              <div className="set-sechead"><h2>Running expenses <span className="set-pill">{money(expTotal)}/mo</span></h2><p>Monthly overhead subtracted from collected cash to reach net profit. Costs change month to month — set each month&apos;s here.</p></div>
              <div className="set-card">
                <div className="set-expbar">
                  <div className="set-monthnav">
                    <button className="set-mbtn" onClick={() => goMonth(-1)} aria-label="Previous month">‹</button>
                    <span className="set-monthlbl">{monthLabel(expMonth)}</span>
                    <button className="set-mbtn" onClick={() => goMonth(1)} aria-label="Next month">›</button>
                  </div>
                  <span className="set-expsrc">
                    {expResolved.source === "month" ? "This month has its own set"
                      : expResolved.source === "carried" ? `Carried from ${monthLabel(expResolved.from!)} — Save all to make it this month's own`
                      : "Showing the default set — Save all to make it this month's own"}
                  </span>
                </div>
                <div className="set-tblwrap"><table className="set-tbl">
                  <thead><tr><th>Expense</th><th>Detail</th><th className="num">Monthly</th><th aria-label="Remove"></th></tr></thead>
                  <tbody>
                    {expenses.length === 0 && (<tr><td colSpan={4} className="set-empty">No costs yet — add your rent, software, utilities and so on below.</td></tr>)}
                    {expenses.map((e, i) => (
                      <tr key={e.id}>
                        <td><input className="set-cellin" placeholder="e.g. Rent" value={e.name} onChange={(ev) => editExpenses(upd(expenses, i, { name: ev.target.value }))} /></td>
                        <td><input className="set-cellin" placeholder="optional note" value={e.detail} onChange={(ev) => editExpenses(upd(expenses, i, { detail: ev.target.value }))} /></td>
                        <td className="num"><span className="set-moneycell"><span className="set-cur">$</span><NumInput className="set-moneyin" value={e.amount} onChange={(v) => editExpenses(upd(expenses, i, { amount: v }))} /></span></td>
                        <td className="act"><button className="set-ic" aria-label={`Remove ${e.name || "cost"}`} title="Remove" onClick={() => editExpenses(expenses.filter((_, k) => k !== i))}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                <button className="set-addrow" onClick={() => editExpenses([...expenses, { id: `exp-${Date.now()}`, name: "", detail: "", amount: 0 }])}><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>Add a cost</button>
              </div>
            </section>
          )}

          {/* Insurers — inline-edit table */}
          {section === "insurers" && (
            <section>
              <div className="set-sechead"><h2>Insurers &amp; co-pay <span className="set-pill">{ins.filter((x) => x.active !== false).length} active</span></h2><p>Each payer&apos;s co-pay rule, claim code, how it bills, and where its claims are emailed. Edit inline — the bar at the bottom saves everything.</p></div>
              <div className="set-card">
                <div className="set-tblwrap"><table className="set-tbl">
                  <thead><tr><th className="grow">Insurer</th><th>Co-pay</th><th className="num">Rate</th><th>Claim code</th><th>Bill by</th><th>Claims email</th><th aria-label="Remove"></th></tr></thead>
                  <tbody>
                    {ins.map((x, i) => (
                      <tr key={x.id}>
                        <td className="grow"><input className="set-cellin inm" value={x.name} onChange={(e) => { setIns(upd(ins, i, { name: e.target.value })); touch(`ins:${x.id}`); }} /></td>
                        <td><span className="set-copay"><span className="set-dot" style={{ background: x.copayType === "none" ? "var(--faint)" : "var(--teal)" }} /><select className="set-cellsel" value={x.copayType} onChange={(e) => { setIns(upd(ins, i, { copayType: e.target.value as CopayType })); touch(`ins:${x.id}`); }}><option value="none">None</option><option value="fixed">Fixed $</option><option value="percentage">% of cost</option></select></span></td>
                        <td className="num">{x.copayType === "none" ? <span className="set-na">—</span> : <NumInput className="set-cellin num" value={x.copayRate} onChange={(v) => { setIns(upd(ins, i, { copayRate: v })); touch(`ins:${x.id}`); }} />}</td>
                        <td><input className="set-cellin" placeholder="e.g. 362" value={x.claimCode ?? ""} onChange={(e) => { setIns(upd(ins, i, { claimCode: e.target.value })); touch(`ins:${x.id}`); }} /></td>
                        <td><select className={`set-chipsel ${x.billStyle === "invoice" ? "inv" : "claim"}`} value={x.billStyle === "invoice" ? "invoice" : "claim"} onChange={(e) => { setIns(upd(ins, i, { billStyle: e.target.value === "invoice" ? "invoice" : "claim" })); touch(`ins:${x.id}`); }}><option value="claim">CMS-1500</option><option value="invoice">Invoice</option></select></td>
                        <td><input className="set-cellin" type="email" placeholder="claims@payer.ky" value={x.email ?? ""} onChange={(e) => { setIns(upd(ins, i, { email: e.target.value })); touch(`ins:${x.id}`); }} /></td>
                        <td className="act"><button className="set-ic" title="Remove insurer" aria-label={`Remove ${x.name}`} onClick={() => run({ entity: "insurer", action: "delete", id: x.id }, "Removed")}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button></td>
                      </tr>
                    ))}
                    <tr className="set-newrow">
                      <td className="grow"><input className="set-cellin" placeholder="New insurer" value={newIns.name} onChange={(e) => setNewIns({ ...newIns, name: e.target.value })} /></td>
                      <td><select className="set-cellsel" value={newIns.copayType} onChange={(e) => setNewIns({ ...newIns, copayType: e.target.value as CopayType })}><option value="none">None</option><option value="fixed">Fixed $</option><option value="percentage">% of cost</option></select></td>
                      <td className="num"><NumInput className="set-cellin num" value={newIns.copayRate} disabled={newIns.copayType === "none"} onChange={(v) => setNewIns({ ...newIns, copayRate: v })} /></td>
                      <td><input className="set-cellin" placeholder="e.g. 362" value={newIns.claimCode ?? ""} onChange={(e) => setNewIns({ ...newIns, claimCode: e.target.value })} /></td>
                      <td><select className={`set-chipsel ${newIns.billStyle === "invoice" ? "inv" : "claim"}`} value={newIns.billStyle === "invoice" ? "invoice" : "claim"} onChange={(e) => setNewIns({ ...newIns, billStyle: e.target.value === "invoice" ? "invoice" : "claim" })}><option value="claim">CMS-1500</option><option value="invoice">Invoice</option></select></td>
                      <td><input className="set-cellin" type="email" placeholder="claims@payer.ky" value={newIns.email ?? ""} onChange={(e) => setNewIns({ ...newIns, email: e.target.value })} /></td>
                      <td className="act"><button className="set-addbtn" disabled={!newIns.name.trim()} onClick={() => { run({ entity: "insurer", name: newIns.name, copayType: newIns.copayType, copayRate: newIns.copayRate, claimCode: newIns.claimCode ?? "", billStyle: newIns.billStyle === "invoice" ? "invoice" : "claim", email: newIns.email ?? "", active: true }, "Added"); setNewIns({ id: "", name: "", copayType: "none", copayRate: 0, active: true }); }}>Add</button></td>
                    </tr>
                  </tbody>
                </table></div>
              </div>
            </section>
          )}

          {/* Service codes */}
          {section === "codes" && (
            <section>
              <div className="set-sechead"><h2>Service codes</h2><p>A code can hold several time &amp; value options (e.g. 90834 at 45 min and a 15-min slot). The first is the default. Edits save with the bar below; Delete removes immediately.</p></div>
              <div className="set-card">
                <div className="set-cpttools"><input className="set-cellin set-cptsearch" placeholder={`Search ${cpt.length} codes — number or name`} value={cptQ} onChange={(e) => setCptQ(e.target.value)} /></div>
                <div className="set-cptscroll">
                  {cptShown.length === 0 ? (
                    <div className="set-empty">No code matches &ldquo;{cptQ}&rdquo;.</div>
                  ) : cptShown.map((x) => {
                    const i = cpt.indexOf(x);
                    const setVar = (vi: number, patch: Partial<CptVar>) => { setCpt(upd(cpt, i, { variants: x.variants.map((v, k) => (k === vi ? { ...v, ...patch } : v)) })); touch(`cpt:${x.code}`); };
                    const open = openCode === x.code;
                    const def = x.variants[0];
                    return (
                      <div className={`set-cptrow ${open ? "open" : ""}`} key={x.code}>
                        <button type="button" className="set-cpthead" onClick={() => setOpenCode(open ? null : x.code)} aria-expanded={open}>
                          <span className="set-cptcode">{x.code}</span>
                          <span className="set-cptdesc">{x.description || <span className="set-cptdesc-empty">No description</span>}</span>
                          {x.variants.length > 1 && <span className="set-cptopts">{x.variants.length} options</span>}
                          <span className="set-cptfee">{money(def?.fee || 0)}</span>
                          <span className="set-cptchev" aria-hidden="true">›</span>
                        </button>
                        {open && (
                          <div className="set-cptedit">
                            <label className="set-editlab">Description</label>
                            <input className="set-cellin boxed" value={x.description} placeholder="e.g. Psychotherapy, 60 min" onChange={(e) => { setCpt(upd(cpt, i, { description: e.target.value })); touch(`cpt:${x.code}`); }} />
                            <label className="set-editlab">Time &amp; value options <span className="set-editnote">first is the default</span></label>
                            <div className="set-cptvars">
                              {x.variants.map((v, vi) => (
                                <div className="set-cptvar" key={vi}>
                                  <input className="set-cellin boxed" placeholder="Label (e.g. 45 min)" value={v.label} onChange={(e) => setVar(vi, { label: e.target.value })} />
                                  <label className="set-varlab">Minutes<NumInput className="set-varnum" value={v.minutes} onChange={(n) => setVar(vi, { minutes: n })} /></label>
                                  <label className="set-varlab">Fee<span className="set-moneycell sm"><span className="set-cur">$</span><NumInput className="set-moneyin" value={v.fee} onChange={(n) => setVar(vi, { fee: n })} /></span></label>
                                  {vi === 0 ? <span className="set-vardefault">default</span> : <button className="set-ic" title="Remove option" onClick={() => { setCpt(upd(cpt, i, { variants: x.variants.filter((_, k) => k !== vi) })); touch(`cpt:${x.code}`); }}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>}
                                </div>
                              ))}
                              <button className="set-addrow sm" onClick={() => { setCpt(upd(cpt, i, { variants: [...x.variants, { label: "", minutes: 30, fee: 0 }] })); touch(`cpt:${x.code}`); }}><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>add an option</button>
                            </div>
                            <div className="set-cptedit-actions">
                              <button className="set-del" onClick={() => run({ entity: "cpt", action: "delete", code: x.code }, "Removed")}>Delete code</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="set-cptnew">
                  <div className="set-cpttop">
                    <input className="set-cellin boxed short" placeholder="90XXX" value={newCpt.code} onChange={(e) => setNewCpt({ ...newCpt, code: e.target.value })} />
                    <input className="set-cellin boxed" placeholder="Description" value={newCpt.description} onChange={(e) => setNewCpt({ ...newCpt, description: e.target.value })} />
                    <button className="set-addbtn" disabled={!newCpt.code.trim()} onClick={() => { run({ entity: "cpt", code: newCpt.code, description: newCpt.description, active: true, variants: newCpt.variants }, "Added"); setNewCpt({ code: "", description: "", active: true, variants: [{ label: "", minutes: 60, fee: 0 }] }); }}>Add code</button>
                  </div>
                  <div className="set-cptvars">
                    {newCpt.variants.map((v, vi) => (
                      <div className="set-cptvar" key={vi}>
                        <input className="set-cellin boxed" placeholder="Label (e.g. 45 min)" value={v.label} onChange={(e) => setNewCpt({ ...newCpt, variants: newCpt.variants.map((y, k) => (k === vi ? { ...y, label: e.target.value } : y)) })} />
                        <label className="set-varlab">min<NumInput className="set-varnum" value={v.minutes} onChange={(n) => setNewCpt({ ...newCpt, variants: newCpt.variants.map((y, k) => (k === vi ? { ...y, minutes: n } : y)) })} /></label>
                        <label className="set-varlab">Fee<span className="set-moneycell sm"><span className="set-cur">$</span><NumInput className="set-moneyin" value={v.fee} onChange={(n) => setNewCpt({ ...newCpt, variants: newCpt.variants.map((y, k) => (k === vi ? { ...y, fee: n } : y)) })} /></span></label>
                        {vi === 0 ? <span className="set-vardefault">default</span> : <button className="set-ic" title="Remove option" onClick={() => setNewCpt({ ...newCpt, variants: newCpt.variants.filter((_, k) => k !== vi) })}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>}
                      </div>
                    ))}
                    <button className="set-addrow sm" onClick={() => setNewCpt({ ...newCpt, variants: [...newCpt.variants, { label: "", minutes: 30, fee: 0 }] })}><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>time / value option</button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Practice details */}
          {section === "practice" && (
            <section>
              <div className="set-sechead"><h2>Practice details <span className="set-pill">claims &amp; invoices</span></h2><p>The billing-provider identifiers that print on every CMS-1500 (boxes 25, 32, 33) and each clinician&apos;s rendering NPI (box 24J), plus the name, address and contact details printed on self-pay invoices. Fill these once.</p></div>
              <div className="set-card set-fieldcard">
                <div className="set-fields">
                  <div className="set-fld"><span className="set-l">Practice name</span><span className="set-inwrap"><input value={prov.practiceName ?? ""} onChange={(e) => setP("practiceName", e.target.value)} /></span></div>
                  <div className="set-fld"><span className="set-l">Phone</span><span className="set-inwrap"><input value={prov.phone ?? ""} onChange={(e) => setP("phone", e.target.value)} /></span></div>
                  <div className="set-fld"><span className="set-l">Email <span className="set-h">· invoices</span></span><span className="set-inwrap"><input value={prov.email ?? ""} onChange={(e) => setP("email", e.target.value)} /></span></div>
                  <div className="set-fld"><span className="set-l">Website <span className="set-h">· invoices</span></span><span className="set-inwrap"><input value={prov.website ?? ""} onChange={(e) => setP("website", e.target.value)} /></span></div>
                  <div className="set-fld"><span className="set-l">Claims reply-to name</span><span className="set-inwrap"><input value={prov.claimsReplyToName ?? ""} onChange={(e) => setP("claimsReplyToName", e.target.value)} placeholder="e.g. Nick O'Connor" /></span></div>
                  <div className="set-fld"><span className="set-l">Claims reply-to email</span><span className="set-inwrap"><input type="email" value={prov.claimsReplyToEmail ?? ""} onChange={(e) => setP("claimsReplyToEmail", e.target.value)} placeholder="where insurer replies go" /></span></div>
                  <div className="set-fld"><span className="set-l">Billing NPI <span className="set-h">· box 33a</span></span><span className="set-inwrap"><input value={prov.npi ?? ""} onChange={(e) => setP("npi", e.target.value)} /></span></div>
                  <div className="set-fld"><span className="set-l">Federal Tax ID / EIN <span className="set-h">· box 25</span></span><span className="set-inwrap"><input value={prov.ein ?? ""} onChange={(e) => setP("ein", e.target.value)} /></span></div>
                  <div className="set-fld"><span className="set-l">Taxonomy code</span><span className="set-inwrap"><input value={prov.taxonomy ?? ""} onChange={(e) => setP("taxonomy", e.target.value)} /></span></div>
                  <div className="set-fld"><span className="set-l">Address line 1</span><span className="set-inwrap"><input value={prov.addressLine1 ?? ""} onChange={(e) => setP("addressLine1", e.target.value)} /></span></div>
                  <div className="set-fld"><span className="set-l">Address line 2</span><span className="set-inwrap"><input value={prov.addressLine2 ?? ""} onChange={(e) => setP("addressLine2", e.target.value)} /></span></div>
                  <div className="set-fld"><span className="set-l">City</span><span className="set-inwrap"><input value={prov.city ?? ""} onChange={(e) => setP("city", e.target.value)} /></span></div>
                  <div className="set-fld"><span className="set-l">District / region</span><span className="set-inwrap"><input value={prov.region ?? ""} onChange={(e) => setP("region", e.target.value)} /></span></div>
                  <div className="set-fld"><span className="set-l">Postal code</span><span className="set-inwrap"><input value={prov.postal ?? ""} onChange={(e) => setP("postal", e.target.value)} /></span></div>
                  <div className="set-fld"><span className="set-l">Country</span><span className="set-inwrap"><input value={prov.country ?? ""} onChange={(e) => setP("country", e.target.value)} /></span></div>
                </div>
                {renderingClinicians.length > 0 && (
                  <div className="set-rnpi">
                    <div className="set-l" style={{ marginBottom: 8 }}>Rendering NPI per clinician <span className="set-h">· box 24J</span></div>
                    <div className="set-rnpigrid">
                      {renderingClinicians.map((c) => (
                        <label key={c.id} className="set-rnpirow">
                          <span className="set-rnpinm">{c.name}</span>
                          <span className="set-inwrap"><input value={rnpi[c.id] ?? ""} onChange={(e) => { setRnpi((m) => ({ ...m, [c.id]: e.target.value })); touch("provider"); }} placeholder="NPI" /></span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Clinician splits — master-detail with live payout preview */}
          {section === "splits" && sel && (
            <section>
              <div className="set-sechead"><h2>Clinician splits</h2><p>Pick a clinician to set their deal. Change a number and the payout below updates instantly. <b>Biller rate</b> is their individual rate for the biller (on insurance collected); <b>Biller base</b> is the share it&apos;s charged on — 0 = auto (their after-retention share). <b>Practice {billerPct}%</b> ticks whether the practice-wide biller commission also applies. Everything comes out of the company&apos;s share, never the clinician&apos;s payout.</p></div>
              <div className="set-card"><div className="set-split">
                <div className="set-clinlist">
                  {clinicians.map((c) => { const s = sets[c.id]; const on = selClin === c.id; return (
                    <button type="button" key={c.id} className={`set-clinrow ${on ? "on" : ""}`} onClick={() => setSelClin(c.id)}>
                      <span className="set-av">{initials(c.name)}</span>
                      <span className="set-clinmeta"><span className="set-clinnm">{c.name}</span></span>
                      <span className="set-clinmt">{s.noPayout ? "—" : `${s.retentionPct}%`}</span>
                      {sectionDirty("splits") && dirty.has(`settings:${c.id}`) && <span className="set-navdot" />}
                    </button>
                  ); })}
                </div>
                <div className="set-editor">
                  <div className="set-edhead"><span className="set-av lg">{initials(clinicians.find((c) => c.id === selClin)?.name ?? "")}</span><div><h3>{clinicians.find((c) => c.id === selClin)?.name}</h3></div></div>
                  <div className="set-fields">
                    <div className="set-fld"><span className="set-l">Company retention <span className="set-h">· what the practice keeps</span></span><span className="set-inwrap"><NumInput value={sel.retentionPct} disabled={sel.noPayout} onChange={(v) => { setSets({ ...sets, [selClin]: { ...sel, retentionPct: v } }); touch(`settings:${selClin}`); }} /><span className="set-u">%</span></span></div>
                    <div className="set-fld"><span className="set-l">Pension <span className="set-h">· of after-retention share</span></span><span className="set-inwrap"><NumInput value={sel.pensionPct} disabled={sel.noPayout} onChange={(v) => { setSets({ ...sets, [selClin]: { ...sel, pensionPct: v } }); touch(`settings:${selClin}`); }} /><span className="set-u">%</span></span></div>
                    <div className="set-fld"><span className="set-l">Biller rate <span className="set-h">· biller&apos;s % on insurance</span></span><span className="set-inwrap"><NumInput value={sel.billerPct} onChange={(v) => { setSets({ ...sets, [selClin]: { ...sel, billerPct: v } }); touch(`settings:${selClin}`); }} /><span className="set-u">%</span></span></div>
                    <div className="set-fld"><span className="set-l">Biller base <span className="set-h">· share it&apos;s charged on · 0 = auto</span></span><span className="set-inwrap"><NumInput value={sel.billerBasePct} onChange={(v) => { setSets({ ...sets, [selClin]: { ...sel, billerBasePct: v } }); touch(`settings:${selClin}`); }} /><span className="set-u">%</span></span></div>
                    <div className="set-fld"><span className="set-l">Health deduction <span className="set-h">· flat monthly</span></span><span className="set-inwrap"><NumInput value={sel.otherDeductionFixed} disabled={sel.noPayout} onChange={(v) => { setSets({ ...sets, [selClin]: { ...sel, otherDeductionFixed: v } }); touch(`settings:${selClin}`); }} /><span className="set-u">KYD</span></span></div>
                    <div className="set-fld"><span className="set-l">Other deduction <span className="set-h">· misc %</span></span><span className="set-inwrap"><NumInput value={sel.otherDeductionPct} disabled={sel.noPayout} onChange={(v) => { setSets({ ...sets, [selClin]: { ...sel, otherDeductionPct: v } }); touch(`settings:${selClin}`); }} /><span className="set-u">%</span></span></div>
                    <div className="set-toggles">
                      <button type="button" className={`set-tg ${sel.billerCommissionApplies ? "on" : ""}`} onClick={() => { setSets({ ...sets, [selClin]: { ...sel, billerCommissionApplies: !sel.billerCommissionApplies } }); touch(`settings:${selClin}`); }}><span className="set-sw" />Practice {billerPct}% applies</button>
                      <button type="button" className={`set-tg ${sel.noPayout ? "on" : ""}`} onClick={() => { setSets({ ...sets, [selClin]: { ...sel, noPayout: !sel.noPayout } }); touch(`settings:${selClin}`); }}><span className="set-sw" />Draws no payout</button>
                    </div>
                    <SplitPreview s={sel} />
                  </div>
                </div>
              </div></div>
            </section>
          )}

          {/* Sample data */}
          {section === "samples" && (
            <section>
              <div className="set-sechead"><h2>Sample data</h2><p>Add a handful of clearly-fake clients (spread across clinicians, with claims at each stage) so the billing screens can be seen populated. Remove them anytime — real clients are never touched.</p></div>
              <div className="set-card" style={{ padding: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="set-addbtn" onClick={() => seedSamples("POST")}>Add sample clients</button>
                <button className="set-del" onClick={() => seedSamples("DELETE")}>Remove sample clients</button>
              </div>
            </section>
          )}
        </div>
      </div>

      <div className="set-savebar"><div className="set-saveinner">
        <span className="set-dirtytxt"><span className={`set-dirtydot ${dirtyCount ? "on" : ""}`} />{dirtyCount === 0 ? "No unsaved changes" : dirtyCount === 1 ? "1 unsaved change" : `${dirtyCount} unsaved changes`}</span>
        <span className="set-sp" />
        <button className="set-btn ghost" disabled={dirtyCount === 0 || saving} onClick={discardAll}>Discard</button>
        <button className="set-btn primary" disabled={dirtyCount === 0 || saving} onClick={saveAll}>{saving ? "Saving…" : "Save all"}</button>
      </div></div>

      {toast && <div className="set-toast">{toast}</div>}
    </div>
  );
}

/** Illustrative payout on $1,000 of insurance collected — mirrors computeClinicianMonth. */
function SplitPreview({ s }: { s: Setting }) {
  const C = 1000;
  const ret = s.noPayout ? 0 : (C * s.retentionPct) / 100;
  const after = C - ret;
  const pen = s.noPayout ? 0 : (after * s.pensionPct) / 100;
  const other = s.noPayout ? 0 : (C * s.otherDeductionPct) / 100;
  const health = s.noPayout ? 0 : s.otherDeductionFixed;
  const basePct = s.billerBasePct > 0 ? s.billerBasePct : Math.max(0, 100 - (s.noPayout ? 0 : s.retentionPct));
  const biller = s.noPayout ? 0 : (C * basePct / 100) * s.billerPct / 100;
  const net = s.noPayout ? 0 : after - pen - other - health - biller;
  const row = (k: string, v: number, minus = false) => (
    <div className={`set-prow ${minus ? "minus" : ""}`}><span className="set-k">{k}</span><span className="set-v">{minus ? "−" : ""}{money0(v)}</span></div>
  );
  return (
    <div className="set-preview">
      <div className="set-pt">Live preview <em>on {money0(C)} of insurance collected</em></div>
      {row("Collected", C)}
      {row(`Company retention (${s.retentionPct}%)`, ret, true)}
      {!s.noPayout && biller > 0 && row(`Biller (${s.billerPct}%)`, biller, true)}
      {!s.noPayout && pen > 0 && row(`Pension (${s.pensionPct}%)`, pen, true)}
      {!s.noPayout && health > 0 && row("Health insurance", health, true)}
      {!s.noPayout && other > 0 && row(`Other (${s.otherDeductionPct}%)`, other, true)}
      <div className="set-prow net"><span className="set-k">{s.noPayout ? "Stays with practice" : "Net payout"}</span><span className="set-v">{money0(s.noPayout ? C : net)}</span></div>
    </div>
  );
}
