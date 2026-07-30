"use client";

import { useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export interface SessionRow {
  id: string;
  date: string;
  clientId: string | null;
  client: string;
  codes: string;
  fee: number;
  copay: number;
  insurance: number;
  status: "self" | "paid" | "pend";
  insurerId: string | null;
  copayDue: number;
  billed: boolean;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STATUS: Record<SessionRow["status"], string> = { self: "Self-pay", paid: "Billed", pend: "Outstanding" };
const pill = (s: SessionRow["status"]) => <span className={`cd-pill ${s}`}>{STATUS[s]}</span>;

/** The month's sessions. Clicking a client opens their full record; the clinician
 *  (and the owner/biller) can also fix or remove a mistaken entry right here. The
 *  client link uses the opaque id, never their name, so no PHI ends up in the URL. */
export default function ClinicianSessions({ month, insurers = [], canManage = false, today = "" }: {
  month: SessionRow[];
  insurers?: { id: string; name: string }[];
  canManage?: boolean;
  today?: string;
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

  function startEdit(s: SessionRow) {
    setDelId(null);
    setEditId(s.id);
    setEcDate(s.date);
    setEcFee(String(s.fee));
    setEcInsurer(s.insurerId ?? "");
    setEcCopay(String(s.copay));
    setEcDue(String(s.copayDue));
    setEcStage(s.status === "paid" ? "paid" : s.billed ? "awaiting" : "tobill");
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
              <td>{pill(s.status)}</td>
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
                    <label>Insurer<select className="ls-in" value={ecInsurer} onChange={(e) => setEcInsurer(e.target.value)}><option value="">Self-pay</option>{insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
                    {ecInsurer && <>
                      <label>Co-pay due<input type="number" step="0.01" min="0" className="ls-in" value={ecDue} onChange={(e) => setEcDue(e.target.value)} /></label>
                      <label>Co-pay collected<input type="number" step="0.01" min="0" className="ls-in" value={ecCopay} onChange={(e) => setEcCopay(e.target.value)} /></label>
                      <label>Status<select className="ls-in" value={ecStage} onChange={(e) => setEcStage(e.target.value as typeof ecStage)}><option value="tobill">To bill</option><option value="awaiting">Awaiting payment</option><option value="paid">Paid</option></select></label>
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
  );
}
