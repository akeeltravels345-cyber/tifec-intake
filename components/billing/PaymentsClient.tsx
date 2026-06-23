"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface PaymentRow {
  id: string;
  dateOfService: string;
  clinicianName: string;
  clientName: string;
  insurerName: string;
  totalCost: number;
  copayCollected: number;
  insurancePaid: boolean;
  paidDate: string | null;
}

const money = (n: number) => `$${n.toFixed(2)}`;
type Tab = "pending" | "paid";

export default function PaymentsClient({ rows, today }: { rows: PaymentRow[]; today: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("pending");
  const [dates, setDates] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");

  const pending = useMemo(() => rows.filter((r) => !r.insurancePaid), [rows]);
  const paid = useMemo(() => rows.filter((r) => r.insurancePaid), [rows]);
  const shown = tab === "pending" ? pending : paid;
  const outstanding = pending.reduce((t, r) => t + r.totalCost, 0);

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
      <div className="bz-kpis" style={{ marginBottom: 18 }}>
        <div className="bz-kpi">
          <span className="bz-kpi-label">Outstanding (all months)</span>
          <span className="bz-kpi-val">{money(outstanding)}</span>
        </div>
        <div className="bz-kpi">
          <span className="bz-kpi-label">Awaiting payment</span>
          <span className="bz-kpi-val">{pending.length}</span>
        </div>
      </div>

      <div className="bz-tabs">
        <button className={`bz-tab ${tab === "pending" ? "on" : ""}`} onClick={() => setTab("pending")}>Pending ({pending.length})</button>
        <button className={`bz-tab ${tab === "paid" ? "on" : ""}`} onClick={() => setTab("paid")}>Paid ({paid.length})</button>
      </div>

      {error && <div className="field-required" style={{ margin: "12px 0" }}>{error}</div>}

      <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 14 }}>
        {shown.length === 0 ? (
          <div className="bz-empty">{tab === "pending" ? "Nothing outstanding. All caught up." : "No payments recorded yet."}</div>
        ) : (
          <table className="bz-table">
            <thead>
              <tr>
                <th>Service date</th>
                <th>Clinician</th>
                <th>Client</th>
                <th>Insurer</th>
                <th className="num">Amount</th>
                <th style={{ minWidth: 220 }}>{tab === "pending" ? "Mark insurance paid" : "Paid"}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>{r.dateOfService}</td>
                  <td>{r.clinicianName}</td>
                  <td>{r.clientName}</td>
                  <td>{r.insurerName}</td>
                  <td className="num">{money(r.totalCost)}</td>
                  <td>
                    {tab === "pending" ? (
                      <div className="bz-pay-action">
                        <input
                          type="date"
                          value={dates[r.id] ?? today}
                          onChange={(e) => setDates((d) => ({ ...d, [r.id]: e.target.value }))}
                        />
                        <button className="primary bz-sm" disabled={busy === r.id} onClick={() => update(r.id, true, dates[r.id] ?? today)}>
                          {busy === r.id ? "…" : "Mark paid"}
                        </button>
                      </div>
                    ) : (
                      <div className="bz-pay-action">
                        <span className="badge bz-pill-paid">Paid · {r.paidDate}</span>
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
