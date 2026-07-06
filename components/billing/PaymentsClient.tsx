"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface PaymentRow {
  id: string;
  dateOfService: string;
  clinicianName: string;
  clientName: string;
  insurerName: string;
  insuranceAmount: number;
  insurancePaid: boolean;
  paidDate: string | null;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
type Tab = "outstanding" | "billed";

export default function PaymentsClient({ rows, today }: { rows: PaymentRow[]; today: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("outstanding");
  const [dates, setDates] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");

  const outstandingRows = useMemo(() => rows.filter((r) => !r.insurancePaid), [rows]);
  const billedRows = useMemo(() => rows.filter((r) => r.insurancePaid), [rows]);
  const shown = tab === "outstanding" ? outstandingRows : billedRows;
  const outstandingTotal = outstandingRows.reduce((t, r) => t + r.insuranceAmount, 0);

  async function update(id: string, paid: boolean, paidDate: string | null) {
    setError("");
    setBusy(id);
    try {
      const res = await fetch("/api/billing/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id, paid, paidDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div>
      <div className="ov-strip" style={{ margin: "0 0 18px" }}>
        <div className="ov-stat"><div className="k">Outstanding (all months)</div><div className="v">{money(outstandingTotal)}</div></div>
        <div className="ov-stat"><div className="k">Claims awaiting insurance</div><div className="v">{outstandingRows.length}</div></div>
      </div>

      <div className="bz-tabs">
        <button className={`bz-tab ${tab === "outstanding" ? "on" : ""}`} onClick={() => setTab("outstanding")}>Outstanding ({outstandingRows.length})</button>
        <button className={`bz-tab ${tab === "billed" ? "on" : ""}`} onClick={() => setTab("billed")}>Billed ({billedRows.length})</button>
      </div>

      {error && <div className="field-required" style={{ margin: "12px 0" }}>{error}</div>}

      <div className="ov-card" style={{ padding: 0, overflow: "hidden", marginTop: 14 }}>
        {shown.length === 0 ? (
          <div className="bz-empty">{tab === "outstanding" ? "Nothing outstanding. All caught up." : "Nothing marked billed yet."}</div>
        ) : (
          <table className="bz-table">
            <thead>
              <tr>
                <th>Service date</th>
                <th>Clinician</th>
                <th>Client</th>
                <th>Insurer</th>
                <th className="num">Insurance owes</th>
                <th style={{ minWidth: 230 }}>{tab === "outstanding" ? "Mark billed (insurance paid)" : "Billed"}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>{r.dateOfService}</td>
                  <td>{r.clinicianName}</td>
                  <td>{r.clientName}</td>
                  <td>{r.insurerName}</td>
                  <td className="num">{money(r.insuranceAmount)}</td>
                  <td>
                    {tab === "outstanding" ? (
                      <div className="bz-pay-action">
                        <input
                          type="date"
                          value={dates[r.id] ?? today}
                          onChange={(e) => setDates((d) => ({ ...d, [r.id]: e.target.value }))}
                        />
                        <button className="primary bz-sm" disabled={busy === r.id} onClick={() => update(r.id, true, dates[r.id] ?? today)}>
                          {busy === r.id ? "…" : "Mark billed"}
                        </button>
                      </div>
                    ) : (
                      <div className="bz-pay-action">
                        <span className="badge bz-pill-paid">Billed · {r.paidDate}</span>
                        <button className="bz-link bz-sm" disabled={busy === r.id} onClick={() => update(r.id, false, null)}>Undo</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
