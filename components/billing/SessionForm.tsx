"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface InsurerOpt { id: string; name: string; copayType: "none" | "fixed" | "percentage"; copayRate: number; }
interface CptOpt { code: string; description: string; }

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
function suggestCopay(ins: InsurerOpt | undefined, total: number): number {
  if (!ins) return 0;
  if (ins.copayType === "fixed") return round2(ins.copayRate);
  if (ins.copayType === "percentage") return round2((total * ins.copayRate) / 100);
  return 0;
}

export default function SessionForm({ insurers, cptCodes }: { insurers: InsurerOpt[]; cptCodes: CptOpt[] }) {
  const router = useRouter();
  const [clientFirst, setClientFirst] = useState("");
  const [clientLast, setClientLast] = useState("");
  const [insurerId, setInsurerId] = useState<string>("");
  const [dateOfService, setDateOfService] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [durationHours, setDurationHours] = useState("1");
  const [totalCost, setTotalCost] = useState("");
  const [copay, setCopay] = useState("");
  const [copayTouched, setCopayTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const insurer = useMemo(() => insurers.find((i) => i.id === insurerId), [insurers, insurerId]);
  const suggested = suggestCopay(insurer, Number(totalCost) || 0);

  // Keep co-pay in sync with the insurer rule until the user edits it themselves.
  const copayValue = copayTouched ? copay : suggested ? String(suggested) : "";

  function toggleCode(code: string) {
    setCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!clientFirst.trim() || !clientLast.trim()) return setError("Client first and last name are required.");
    if (!dateOfService) return setError("Date of service is required.");
    if (totalCost === "" || isNaN(Number(totalCost))) return setError("Total service cost is required.");
    setBusy(true);
    try {
      const res = await fetch("/api/billing/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientFirst: clientFirst.trim(),
          clientLast: clientLast.trim(),
          insurerId: insurerId || null,
          dateOfService,
          cptCodes: codes,
          durationHours: Number(durationHours) || 0,
          totalCost: Number(totalCost),
          copayCollected: Number(copayValue) || 0,
          notes: notes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the session.");
      router.push("/billing/me");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="ov-card">
      {error && <div className="field-required" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="field" style={{ borderTop: "none", paddingTop: 0 }}>
        <label className="q">Client name <span className="req">*</span></label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input style={{ flex: 1, minWidth: 140 }} placeholder="First" value={clientFirst} onChange={(e) => setClientFirst(e.target.value)} />
          <input style={{ flex: 1, minWidth: 140 }} placeholder="Last" value={clientLast} onChange={(e) => setClientLast(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label className="q">Date of service <span className="req">*</span></label>
        <input type="date" value={dateOfService} onChange={(e) => setDateOfService(e.target.value)} />
      </div>

      <div className="field">
        <label className="q">Insurance provider</label>
        <select value={insurerId} onChange={(e) => { setInsurerId(e.target.value); setCopayTouched(false); }}>
          <option value="">Self-pay / none</option>
          {insurers.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="q">CPT / service code(s)</label>
        {cptCodes.length === 0 ? (
          <p className="help">No CPT codes configured yet. An admin can add them under Setup.</p>
        ) : (
          <div className="bz-cpt">
            {cptCodes.map((c) => (
              <button type="button" key={c.code} className={`bz-cpt-opt ${codes.includes(c.code) ? "on" : ""}`} onClick={() => toggleCode(c.code)} title={c.description}>
                {c.code}{c.description ? ` · ${c.description}` : ""}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="field">
        <label className="q">Duration (hours)</label>
        <input type="number" step="0.25" min="0" style={{ maxWidth: 160 }} value={durationHours} onChange={(e) => setDurationHours(e.target.value)} />
      </div>

      <div className="field">
        <label className="q">Total service cost (KYD) <span className="req">*</span></label>
        <input type="number" step="0.01" min="0" style={{ maxWidth: 200 }} value={totalCost} onChange={(e) => setTotalCost(e.target.value)} placeholder="0.00" />
      </div>

      <div className="field">
        <label className="q">Co-pay collected (KYD)</label>
        <input type="number" step="0.01" min="0" style={{ maxWidth: 200 }} value={copayValue} onChange={(e) => { setCopayTouched(true); setCopay(e.target.value); }} placeholder="0.00" />
        {insurer && !copayTouched && suggested > 0 && (
          <p className="help">Auto-suggested from {insurer.name} ({insurer.copayType === "percentage" ? `${insurer.copayRate}%` : `$${insurer.copayRate}`}). You can edit it.</p>
        )}
      </div>

      <div className="field">
        <label className="q">Notes (optional)</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <button type="submit" className="primary" disabled={busy}>{busy ? "Saving…" : "Save session"}</button>
    </form>
  );
}
