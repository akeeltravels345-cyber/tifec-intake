"use client";

import { useState } from "react";

interface Result {
  apply: boolean;
  clinicianName: string;
  totals: { intake: number; alreadyOnBook: number; toCreate: number; created: number };
  toCreate: { name: string; dob?: string }[];
}

// Admin tool: create no-charge client records from a practicum clinician's
// intake clients, so their unpaid caseload exists for session notes. Preview
// first (writes nothing), then apply.
export default function ImportIntakeClients({ clinicians }: { clinicians: { id: string; name: string }[] }) {
  const [who, setWho] = useState(clinicians[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [applied, setApplied] = useState(false);
  const [err, setErr] = useState("");

  async function run(apply: boolean) {
    if (!who) { setErr("Pick a clinician."); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/billing/import-intake-clients", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apply ? { clinicianId: who, apply: true } : { clinicianId: who }),
      });
      const data = await r.json();
      if (!r.ok) { setErr(data.error || "Something went wrong."); return; }
      setRes(data);
      if (apply) setApplied(true);
    } catch { setErr("Could not reach the server."); }
    finally { setBusy(false); }
  }

  const t = res?.totals;

  if (clinicians.length === 0) return null;

  return (
    <div className="iie">
      <h2 className="iie-h">Import a practicum caseload from intake</h2>
      <p className="iie-sub">
        Creates <b>no-charge</b> client records from a practicum clinician&apos;s intake clients, so their unpaid
        caseload exists here for session notes. The records carry no charges, so they never appear in payouts or the
        billing queue. Anyone already on their book is skipped.
      </p>

      <div className="iie-acts">
        {clinicians.length > 1 && (
          <select className="ls-in" value={who} onChange={(e) => { setWho(e.target.value); setRes(null); setApplied(false); }} style={{ maxWidth: 220 }}>
            {clinicians.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <button className="iie-btn" disabled={busy} onClick={() => { setApplied(false); run(false); }}>
          {busy && !applied ? "Checking…" : "Preview clients"}
        </button>
        {res && !applied && t && t.toCreate > 0 && (
          <button className="iie-btn apply" disabled={busy} onClick={() => run(true)}>
            {busy ? "Creating…" : `Create ${t.toCreate} record${t.toCreate === 1 ? "" : "s"}`}
          </button>
        )}
      </div>

      {err && <p className="iie-err">{err}</p>}

      {res && t && (
        <div className="iie-out">
          <div className="iie-stats">
            <span>for <b>{res.clinicianName}</b></span>
            <span><b>{t.intake}</b> intake clients</span>
            <span><b>{applied ? t.created : t.toCreate}</b> {applied ? "created" : "to create"}</span>
            <span><b>{t.alreadyOnBook}</b> already on book</span>
          </div>

          {applied ? (
            <p className="iie-done">✓ Created {t.created} no-charge record{t.created === 1 ? "" : "s"} for {res.clinicianName}.</p>
          ) : t.toCreate > 0 ? (
            <>
              <p className="iie-note">These records will be created when you click Create:</p>
              <ul className="iie-list">
                {res.toCreate.map((c, i) => (
                  <li key={i}><span className="nm">{c.name}</span><span className="em">{c.dob ? `DOB ${c.dob}` : "no DOB"}</span></li>
                ))}
              </ul>
            </>
          ) : (
            <p className="iie-note">Nothing to create. Every intake client is already on their book.</p>
          )}
        </div>
      )}
    </div>
  );
}
