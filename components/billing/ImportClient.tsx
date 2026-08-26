"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { parseCsv, buildRows, type DateOrder, type Ref } from "@/lib/billingImport";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TEMPLATE = `Date,Client,Clinician,Insurer,Total,Copay,Paid date
2026-06-04,Maria Bodden,Dr. Donnet O'Connor,BritCay,250,50,2026-06-20
2026-06-11,Andre Foster,Dr. Joan Latty,Aetna,275,55,
2026-06-18,Kayla Ebanks,Dr. Shion O'Connor,CINICO,300,0,`;

export default function ImportClient({ clinicians, insurers }: { clinicians: Ref[]; insurers: Ref[] }) {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [dateOrder, setDateOrder] = useState<DateOrder>("auto");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; duplicates: number; failed: number } | null>(null);
  const [error, setError] = useState("");

  // Same parser the server uses, so the preview is the truth.
  const rows = useMemo(() => {
    if (!csv.trim()) return [];
    try { return buildRows(parseCsv(csv), clinicians, insurers, dateOrder); } catch { return []; }
  }, [csv, clinicians, insurers, dateOrder]);

  const good = rows.filter((r) => r.errors.length === 0);
  const bad = rows.filter((r) => r.errors.length > 0);
  const totalValue = good.reduce((t, r) => t + r.totalCost, 0);
  const unbilled = good.filter((r) => !r.insurancePaid).length;

  async function readFile(f: File) {
    setCsv(await f.text());
    setResult(null);
  }

  async function run() {
    setBusy(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/billing/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, dateOrder }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Import failed");
      setResult(j);
      setCsv("");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed"); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="su-sec">
        <div className="su-sechead">
          <h3 className="su-sech">1 · Paste or drop your file</h3>
          <span className="su-hint">Export a CSV from your billing software, or build one in Excel. Leave the paid date empty for work you haven&apos;t billed yet.</span>
        </div>
        <div className="su-card">
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }} style={{ fontSize: 13 }} />
              <button type="button" className="su-add" style={{ margin: 0 }} onClick={() => { setCsv(TEMPLATE); setResult(null); }}>Use an example</button>
              <span style={{ flex: 1 }} />
              <label className="ls-q" style={{ margin: 0 }} htmlFor="dord">Dates are</label>
              <select id="dord" className="su-sel" style={{ width: "auto" }} value={dateOrder} onChange={(e) => setDateOrder(e.target.value as DateOrder)}>
                <option value="auto">Work it out</option>
                <option value="ymd">2026-07-14</option>
                <option value="dmy">14/07/2026 (day first)</option>
                <option value="mdy">07/14/2026 (month first)</option>
              </select>
            </div>
            <textarea
              className="su-in" rows={7} value={csv} spellCheck={false}
              onChange={(e) => { setCsv(e.target.value); setResult(null); }}
              placeholder={"Date,Client,Clinician,Insurer,Total,Copay,Paid date\n2026-06-04,Maria Bodden,Dr. Donnet O'Connor,BritCay,250,50,2026-06-20"}
              style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12.5, resize: "vertical" }}
            />
            <p className="su-hint" style={{ margin: "10px 2px 0" }}>
              The first line must be the header. Column names are flexible: <b>Provider</b> works as well as <b>Clinician</b>, <b>Amount</b> as well as <b>Total</b>. A row with a paid date comes in already collected; one without is outstanding and lands in your queue.
            </p>
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="su-sec">
          <div className="su-sechead">
            <h3 className="su-sech">2 · Check it before it lands</h3>
            <span className="su-hint">{good.length} ready{bad.length > 0 ? `, ${bad.length} need fixing` : ""} · {money(totalValue)} of work · {unbilled} still to bill</span>
          </div>
          <div className="su-card">
            <div className="su-tblwrap">
              <table className="su-tbl" style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    <th>Line</th><th>Date</th><th>Client</th><th>Clinician</th><th>Insurer</th>
                    <th className="num">Total</th><th className="num">Co-pay</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 60).map((r) => (
                    <tr key={r.line} style={r.errors.length ? { background: "#FDF3F1" } : undefined}>
                      <td style={{ color: "var(--faint)" }}>{r.line}</td>
                      <td>{r.dateOfService || "—"}</td>
                      <td className="nm">{`${r.clientFirst} ${r.clientLast}`.trim() || "—"}</td>
                      <td>{r.clinicianName || "—"}</td>
                      <td>{r.insurerName || "Self-pay"}</td>
                      <td className="num">{money(r.totalCost)}</td>
                      <td className="num">{money(r.copayCollected)}</td>
                      <td>
                        {r.errors.length > 0
                          ? <span style={{ color: "var(--neg)", fontWeight: 600, fontSize: 12.5 }}>{r.errors.join(" · ")}</span>
                          : r.insurancePaid
                            ? <span className="su-tag">Collected {r.paidDate}</span>
                            : <span style={{ color: "var(--muted)", fontSize: 12.5 }}>To bill</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 60 && <p className="su-hint" style={{ padding: "12px 16px", margin: 0 }}>Showing the first 60 of {rows.length}. All {good.length} valid rows will be imported.</p>}
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
            <button className="bl-cta" type="button" onClick={run} disabled={busy || good.length === 0}>
              {busy ? "Importing..." : `Import ${good.length} row${good.length === 1 ? "" : "s"}`}
            </button>
            {bad.length > 0 && <span className="su-hint">{bad.length} row{bad.length === 1 ? "" : "s"} will be skipped until you fix {bad.length === 1 ? "it" : "them"}.</span>}
          </div>
        </div>
      )}

      {result && (
        <div className="su-card" style={{ padding: 16, marginBottom: 24 }}>
          <b>Imported {result.imported} row{result.imported === 1 ? "" : "s"}.</b>
          {result.duplicates > 0 && <> {result.duplicates} were already here and were left alone.</>}
          {result.failed > 0 && <> {result.failed} had problems and were skipped.</>}
          {" "}They&apos;re in your <a href="/billing/payments">billing queue</a> now.
        </div>
      )}
      {error && <div className="su-card" style={{ padding: 16, marginBottom: 24, color: "var(--neg)" }}>{error}</div>}
    </>
  );
}
