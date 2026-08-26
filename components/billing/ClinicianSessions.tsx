"use client";

import { useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Foldable from "./Foldable";
import { collapseUnits } from "@/lib/cptUnits";

export interface SessionRow {
  id: string;
  date: string;
  clientId: string | null;
  client: string;
  codes: string;
  codeList: string[];
  fee: number;
  copay: number;
  insurance: number;
  status: "self" | "paid" | "pend" | "writeoff" | "writedown";
  insurerId: string | null;
  copayDue: number;
  billed: boolean;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
// The pill reflects the real lifecycle: an insured claim is To bill (logged, not
// yet submitted), then Billed (submitted, waiting on the insurer), then Collected
// once the biller marks the money in. A claim the biller settles WITHOUT payment
// reads as Written off / Written down — never Collected, and it doesn't pay out.
const pill = (s: SessionRow) =>
  s.status === "self" ? <span className="cd-pill self hastip" data-tip="Client pays directly. No insurer involved.">Self-pay</span>
  : s.status === "writeoff" ? <span className="cd-pill adjusted hastip" data-tip="Contractual write-off. Not collected, not paid to you.">Written off</span>
  : s.status === "writedown" ? <span className="cd-pill adjusted hastip" data-tip="Written down. Not collected, not paid to you.">Written down</span>
  : s.status === "paid" ? <span className="cd-pill paid hastip" data-tip="Insurer paid, cash collected. This is what pays out to you.">Collected</span>
  : s.billed ? <span className="cd-pill billed hastip" data-tip="Claim submitted to the insurer, waiting on payment.">Billed</span>
  : <span className="cd-pill pend hastip" data-tip="Logged, not yet submitted to the insurer.">To bill</span>;

/** The month's sessions. Clicking a client opens their full record; the clinician
 *  (and the owner/biller) can also fix or remove a mistaken entry right here. The
 *  client link uses the opaque id, never their name, so no PHI ends up in the URL. */
export default function ClinicianSessions({ month, insurers = [], canManage = false, today = "", cptCodes = [] }: {
  month: SessionRow[];
  insurers?: { id: string; name: string }[];
  canManage?: boolean;
  today?: string;
  cptCodes?: { code: string; description: string; fee: number }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [delId, setDelId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [ecDate, setEcDate] = useState("");
  const [ecFee, setEcFee] = useState("");
  const [ecInsurer, setEcInsurer] = useState("");
  const [ecCopay, setEcCopay] = useState("");
  const [ecDue, setEcDue] = useState("");
  const [ecStage, setEcStage] = useState<"tobill" | "awaiting" | "paid">("awaiting");
  const [ecCodes, setEcCodes] = useState<string[]>([]);
  const cptFee = (code: string) => cptCodes.find((c) => c.code === code)?.fee ?? 0;
  const cptLabel = (code: string) => { const c = cptCodes.find((x) => x.code === code); return c ? `${c.code} · ${c.description}` : code; };

  function startEdit(s: SessionRow) {
    setDelId(null);
    setEditId(s.id);
    setEcDate(s.date);
    setEcFee(String(s.fee));
    setEcInsurer(s.insurerId ?? "");
    setEcCopay(String(s.copay));
    setEcDue(String(s.copayDue));
    setEcStage(s.status === "paid" ? "paid" : s.billed ? "awaiting" : "tobill");
    setEcCodes(s.codeList ?? []);
  }
  // Re-suggest the fee as the sum over the (possibly repeated) code array.
  function resuggestFee(next: string[]) {
    if (cptCodes.length) {
      const sum = next.reduce((s, c) => s + cptFee(c), 0);
      if (sum > 0) setEcFee(String(round2(sum)));
    }
  }
  // Add a code (one unit) or remove a code entirely. Codes may repeat = units.
  function toggleEcCode(code: string, on: boolean) {
    setEcCodes((prev) => {
      const next = on ? [...prev, code] : prev.filter((c) => c !== code);
      resuggestFee(next);
      return next;
    });
  }
  // Nudge a code's unit count up (+1 occurrence) or down (remove one occurrence).
  function bumpEcCode(code: string, delta: number) {
    setEcCodes((prev) => {
      const next = [...prev];
      if (delta > 0) next.push(code);
      else { const i = next.lastIndexOf(code); if (i >= 0) next.splice(i, 1); }
      resuggestFee(next);
      return next;
    });
  }
  async function saveEdit(id: string) {
    if (!ecDate || ecFee === "") { setMsg("Enter a date and fee."); return; }
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`/api/billing/sessions/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateOfService: ecDate, totalCost: Number(ecFee) || 0,
          insurerId: ecInsurer || null,
          copayCollected: ecInsurer ? Number(ecCopay) || 0 : 0,
          copayDue: ecInsurer ? Number(ecDue) || 0 : 0,
          stage: ecInsurer ? ecStage : "paid",
          cptCodes: ecCodes,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not save.");
      setEditId(null); router.refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not save."); }
    finally { setBusy(false); }
  }
  async function del(id: string) {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`/api/billing/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Could not delete.");
      setDelId(null); router.refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not delete."); }
    finally { setBusy(false); }
  }

  return (
    <Foldable unit="sessions">
    <div className="cd-tblwrap">
      {msg && <div className="ls-err" style={{ margin: "0 0 10px" }}>{msg}</div>}
      <table className="cd-tbl">
        <thead>
          <tr>
            <th>Date</th><th>Client</th><th>Code</th>
            <th className="num">Fee</th><th className="num">Co-pay</th><th className="num">Insurance</th><th>Status</th>
            {canManage && <th></th>}
          </tr>
        </thead>
        <tbody>
          {month.map((s) => (
            <Fragment key={s.id}>
            <tr>
              <td>{s.date}</td>
              <td className="nm">
                {s.clientId
                  ? <Link href={`/billing/clients/${s.clientId}`} className="bq-clientlink">{s.client}</Link>
                  : s.client}
              </td>
              <td>{s.codes || "—"}</td>
              <td className="num">{money(s.fee)}</td>
              <td className="num">{money(s.copay)}</td>
              <td className="num">{money(s.insurance)}</td>
              <td>{pill(s)}</td>
              {canManage && (
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {delId === s.id ? (
                    <>
                      <button className="cd-danger sm" disabled={busy} onClick={() => del(s.id)}>Delete</button>
                      <button className="su-del sm" disabled={busy} onClick={() => setDelId(null)}>Cancel</button>
                    </>
                  ) : editId === s.id ? (
                    <button className="su-del sm" disabled={busy} onClick={() => setEditId(null)}>Close</button>
                  ) : (
                    <>
                      <button className="cd-editbtn" title="Edit this session" onClick={() => startEdit(s)}>✎</button>
                      <button className="cd-xbtn" title="Delete this session" onClick={() => setDelId(s.id)}>×</button>
                    </>
                  )}
                </td>
              )}
            </tr>
            {editId === s.id && (
              <tr className="cd-editrow">
                <td colSpan={canManage ? 8 : 7}>
                  <div className="cd-editform">
                    <label>Date<input type="date" className="ls-in" value={ecDate} onChange={(e) => setEcDate(e.target.value)} /></label>
                    <label>Fee<input type="number" step="0.01" min="0" className="ls-in" value={ecFee} onChange={(e) => setEcFee(e.target.value)} /></label>
                    {cptCodes.length > 0 && (
                      <div className="cd-editcodes">
                        <span className="cd-lab">Service codes <span className="opt">changing these re-suggests the fee</span></span>
                        <div className="cd-codechips">
                          {ecCodes.length === 0 && <span className="cd-nocodes">No codes yet</span>}
                          {collapseUnits(ecCodes).map(({ code, units }) => (
                            <span className="cd-codechip" key={code} title={cptLabel(code)}>
                              {code}
                              <span className="cd-qty">
                                <button type="button" className="qb" aria-label={`Fewer units of ${code}`} onClick={() => bumpEcCode(code, -1)} disabled={units <= 1}>−</button>
                                <span className="qn">×{units}</span>
                                <button type="button" className="qb" aria-label={`More units of ${code}`} onClick={() => bumpEcCode(code, 1)}>+</button>
                              </span>
                              <button type="button" className="cx" aria-label={`Remove ${code}`} onClick={() => toggleEcCode(code, false)}>×</button>
                            </span>
                          ))}
                        </div>
                        <select className="ls-in" value="" onChange={(e) => { if (e.target.value) toggleEcCode(e.target.value, true); }}>
                          <option value="">+ Add a code…</option>
                          {cptCodes.filter((c) => !ecCodes.includes(c.code)).map((c) => (
                            <option key={c.code} value={c.code}>{c.code} · {c.description} ({money(c.fee)})</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <label>Insurer<select className="ls-in" value={ecInsurer} onChange={(e) => setEcInsurer(e.target.value)}><option value="">Self-pay</option>{insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
                    {ecInsurer && <>
                      <label>Co-pay due<input type="number" step="0.01" min="0" className="ls-in" value={ecDue} onChange={(e) => setEcDue(e.target.value)} /></label>
                      <label>Co-pay collected<input type="number" step="0.01" min="0" className="ls-in" value={ecCopay} onChange={(e) => setEcCopay(e.target.value)} /></label>
                      <label>Status<select className="ls-in" value={ecStage} onChange={(e) => setEcStage(e.target.value as typeof ecStage)}><option value="tobill">To bill</option><option value="awaiting">Billed (awaiting payment)</option><option value="paid">Collected</option></select></label>
                    </>}
                    <div className="cd-editactions">
                      <button className="ls-save sm" disabled={busy} onClick={() => saveEdit(s.id)}>{busy ? "Saving…" : "Save change"}</button>
                      <button className="su-del sm" disabled={busy} onClick={() => setEditId(null)}>Cancel</button>
                    </div>
                  </div>
                </td>
              </tr>
            )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
    </Foldable>
  );
}
