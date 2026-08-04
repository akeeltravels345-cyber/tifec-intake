"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Foldable from "./Foldable";

export interface StagedRow {
  id: string;
  clientFirst: string; clientLast: string; dob: string;
  insurerName: string; cpt: string; fee: number;
  dateOfService: string; billedDate: string; invNo: string;
  clinician: string;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ImportReview({ rows, counts, insurers, cptCodes, canLoad }: {
  rows: StagedRow[];
  counts: { pending: number; accepted: number; rejected: number };
  insurers: { id: string; name: string }[];
  cptCodes: { code: string; description: string }[];
  canLoad: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string>("");
  const [msg, setMsg] = useState("");
  // Local edits + insurer choice per row.
  const [edit, setEdit] = useState<Record<string, Partial<StagedRow>>>({});
  const guessInsurer = (name: string) => insurers.find((i) => i.name.toLowerCase().includes((name || "").toLowerCase().split(" ")[0]))?.id
    ?? insurers.find((i) => (name || "").toLowerCase().includes(i.name.toLowerCase()))?.id ?? "";
  const [ins, setIns] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, guessInsurer(r.insurerName)])));

  const val = (r: StagedRow, k: keyof StagedRow) => (edit[r.id]?.[k] ?? r[k]) as string | number;
  const set = (id: string, k: keyof StagedRow, v: string | number) =>
    setEdit((e) => ({ ...e, [id]: { ...e[id], [k]: v } }));

  async function call(payload: Record<string, unknown>, method = "POST") {
    const res = await fetch("/api/billing/import/stage", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
  }

  async function loadBatch() {
    setBusy("load"); setMsg("");
    try { await call({ action: "load" }); router.refresh(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Could not load."); }
    finally { setBusy(""); }
  }

  async function saveRow(r: StagedRow) {
    const e = edit[r.id];
    if (!e || Object.keys(e).length === 0) return;
    await call({ id: r.id, ...e }, "PATCH");
  }

  async function accept(r: StagedRow) {
    if (!ins[r.id]) { setMsg(`Pick an insurer for ${r.clientFirst} ${r.clientLast} first.`); return; }
    setBusy(r.id); setMsg("");
    try { await saveRow(r); await call({ action: "accept", id: r.id, insurerId: ins[r.id] }); router.refresh(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Could not accept."); }
    finally { setBusy(""); }
  }
  async function reject(r: StagedRow) {
    setBusy(r.id); setMsg("");
    try { await call({ action: "reject", id: r.id }); router.refresh(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Could not reject."); }
    finally { setBusy(""); }
  }

  // Group by client.
  const groups = new Map<string, StagedRow[]>();
  for (const r of rows) {
    const k = `${r.clientLast}, ${r.clientFirst}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  return (
    <>
      <div className="su-topbar">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 className="su-h1">Import review</h1>
            <p className="su-sub">Records pulled from an outside report, waiting for you to check and accept. Nothing is in the system until you accept it — edit anything that&apos;s wrong first.</p>
          </div>
          <div className="ir-counts">
            <span className="ir-chip pending">{counts.pending} to review</span>
            <span className="ir-chip done">{counts.accepted} accepted</span>
            {counts.rejected > 0 && <span className="ir-chip rej">{counts.rejected} rejected</span>}
          </div>
        </div>
      </div>

      {msg && <div className="ls-err" style={{ margin: "0 0 12px" }}>{msg}</div>}

      {rows.length === 0 ? (
        <div className="bq-empty" style={{ padding: 28 }}>
          <div className="big">{counts.accepted + counts.rejected > 0 ? "All caught up" : "Nothing to review"}</div>
          <div className="small">
            {counts.accepted + counts.rejected > 0
              ? "Every imported record has been accepted or rejected."
              : "When a batch is loaded, each record will appear here to check one by one."}
          </div>
          {canLoad && counts.accepted + counts.rejected === 0 && (
            <button className="ls-save" style={{ marginTop: 14 }} disabled={busy === "load"} onClick={loadBatch}>
              {busy === "load" ? "Loading…" : "Load the PRC · Dr. Latty batch (90 records · $18,206.01)"}
            </button>
          )}
        </div>
      ) : (
        [...groups.entries()].map(([client, list]) => {
          const total = list.reduce((t, r) => t + Number(val(r, "fee") || 0), 0);
          return (
            <div className="ir-group" key={client}>
              <div className="ir-ghead"><span className="nm">{client}</span><span className="ct">{list.length} session{list.length === 1 ? "" : "s"} · {money(total)}</span></div>
              <Foldable unit="sessions" rowSelector=".ir-row">
                <div className="ir-rows">
                  {list.map((r) => (
                    <div className="ir-row" key={r.id}>
                      <div className="ir-fields">
                        <label>First<input className="ls-in" value={val(r, "clientFirst")} onChange={(e) => set(r.id, "clientFirst", e.target.value)} /></label>
                        <label>Last<input className="ls-in" value={val(r, "clientLast")} onChange={(e) => set(r.id, "clientLast", e.target.value)} /></label>
                        <label>Date of service<input type="date" className="ls-in" value={val(r, "dateOfService") as string} onChange={(e) => set(r.id, "dateOfService", e.target.value)} /></label>
                        <label>Code<select className="ls-in" value={val(r, "cpt") as string} onChange={(e) => set(r.id, "cpt", e.target.value)}>
                          {!cptCodes.some((c) => c.code === (val(r, "cpt") as string)) && <option value={val(r, "cpt") as string}>{val(r, "cpt") as string}</option>}
                          {cptCodes.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.description}</option>)}
                        </select></label>
                        <label>Fee<input type="number" step="0.01" min="0" className="ls-in" value={val(r, "fee")} onChange={(e) => set(r.id, "fee", Number(e.target.value))} /></label>
                        <label>Insurer<select className="ls-in" value={ins[r.id] ?? ""} onChange={(e) => setIns((m) => ({ ...m, [r.id]: e.target.value }))}>
                          <option value="">Pick insurer…</option>
                          {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                        </select></label>
                        <label>Billed date<input type="date" className="ls-in" value={val(r, "billedDate") as string} onChange={(e) => set(r.id, "billedDate", e.target.value)} /></label>
                      </div>
                      <div className="ir-meta">{r.invNo ? `inv #${r.invNo}` : ""} {r.insurerName ? `· ${r.insurerName}` : ""}</div>
                      <div className="ir-acts">
                        <button className="ls-save sm" disabled={!!busy} onClick={() => accept(r)}>{busy === r.id ? "Accepting…" : "✓ Accept into system"}</button>
                        <button className="su-del sm" disabled={!!busy} onClick={() => reject(r)}>Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              </Foldable>
            </div>
          );
        })
      )}
    </>
  );
}
